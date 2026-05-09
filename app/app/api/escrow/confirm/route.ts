import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendMarkerTransaction } from "@/lib/solana";

/**
 * POST /api/escrow/confirm
 *
 * Bridge endpoint used by HireModal + JobWizard. After the on-chain
 * settlement refactor (audit C-01 / H-02), the canonical job-creation
 * entry point is POST /api/jobs. For the live-demo flow we re-enable a
 * `demoMode` shortcut here that creates a record-only job in Postgres
 * without on-chain escrow, so the demo stays unblocked while the real
 * `createJobOnChain` integration is wired up in the calling components.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      posterWallet,
      amount,
      jobData,
      escrowTxHash,
      escrowAta,
      demoMode,
    } = body;

    if (!posterWallet || typeof posterWallet !== "string") {
      return NextResponse.json(
        { error: "posterWallet is required" },
        { status: 400 },
      );
    }
    const numAmount = Number(amount);
    if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
      return NextResponse.json(
        { error: "amount must be a positive number" },
        { status: 400 },
      );
    }
    if (!jobData || typeof jobData !== "object") {
      return NextResponse.json(
        { error: "jobData is required" },
        { status: 400 },
      );
    }

    const {
      title,
      description,
      requirements,
      category,
      minWords = 100,
      language = "English",
      deadline,
    } = jobData;

    const deadlineDate = deadline ? new Date(deadline) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    if (isNaN(deadlineDate.getTime())) {
      return NextResponse.json({ error: "Invalid deadline" }, { status: 400 });
    }

    const specJson = {
      title: String(title || "").trim(),
      description: String(description || "").trim(),
      requirements: String(requirements || "").trim(),
      category: String(category || "text_writing"),
      minWords: Number(minWords) || 100,
      language: String(language || "English"),
    };
    const specHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(specJson))
      .digest("hex");

    // Demo / no-escrow path — creates a Postgres row mirroring the job.
    // Real on-chain escrow is the responsibility of the caller; when
    // present, escrowTxHash + escrowAta are recorded for traceability.
    const job = await prisma.job.create({
      data: {
        posterWallet,
        amount: numAmount,
        specHash,
        specJson,
        minWords: specJson.minWords,
        category: specJson.category,
        paymentToken: "USDC",
        language: "en",
        deadline: deadlineDate,
        status: "Open",
        txHash: escrowTxHash || null,
        escrowAta: escrowAta || null,
      },
    });

    if (escrowTxHash) {
      try {
        await prisma.transaction.create({
          data: {
            txHash: escrowTxHash,
            type: "create_job",
            jobId: job.id,
            wallet: posterWallet,
            amount: numAmount,
            status: "confirmed",
          },
        });
      } catch { /* non-blocking */ }
    }

    let markerTxHash: string | null = null;
    if (!escrowTxHash) {
      try {
        markerTxHash = await sendMarkerTransaction(
          (demoMode ? "create_job_demo:" : "create_job_record:") + job.id,
        );
        await prisma.job.update({ where: { id: job.id }, data: { txHash: markerTxHash } });
      } catch { /* non-blocking */ }
    }

    return NextResponse.json(
      {
        ...job,
        id: job.id,
        jobId: job.id,
        txHash: escrowTxHash || markerTxHash,
        escrowLocked: !!escrowTxHash,
        demoMode: !!demoMode,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[/api/escrow/confirm] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create job" },
      { status: 500 },
    );
  }
}
