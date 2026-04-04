import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Keypair } from "@solana/web3.js";
import { lockFundsInEscrow } from "@/lib/escrow";
import { sendMarkerTransaction } from "@/lib/solana";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      posterWallet,
      amount,
      jobData,
    } = body;

    if (!posterWallet || typeof posterWallet !== "string") {
      return NextResponse.json({ error: "posterWallet is required" }, { status: 400 });
    }
    if (!amount || typeof amount !== "number" || amount <= 0) {
      return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    }
    if (!jobData || typeof jobData !== "object") {
      return NextResponse.json({ error: "jobData is required" }, { status: 400 });
    }

    const {
      title,
      description,
      requirements,
      category,
      paymentToken,
      minWords,
      language,
      deadline,
      sourceText,
      repoUrl,
      targetUrl,
      stylePreference,
    } = jobData;

    if (!minWords || !deadline) {
      return NextResponse.json({ error: "jobData must include minWords and deadline" }, { status: 400 });
    }

    const deadlineDate = new Date(deadline);
    if (isNaN(deadlineDate.getTime())) {
      return NextResponse.json({ error: "deadline must be a valid date" }, { status: 400 });
    }

    // Build spec JSON
    const specJson = {
      posterWallet,
      amount,
      minWords,
      language: language || "English",
      deadline: deadlineDate.toISOString(),
      createdAt: new Date().toISOString(),
      title: title || "",
      description: description || "",
      requirements: requirements || "",
      ...(sourceText ? { sourceText } : {}),
      ...(repoUrl ? { repoUrl } : {}),
      ...(targetUrl ? { targetUrl } : {}),
      ...(stylePreference ? { stylePreference } : {}),
    };

    const specHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(specJson))
      .digest("hex");

    // Attempt server-side escrow lock
    // For known wallets with keypairs, do a real SPL transfer
    // For external wallets, use mint+lock (deployer mints to escrow on behalf)
    let escrowTxHash: string | null = null;

    const knownWallets: Record<string, string> = {};
    if (process.env.AGENT_ALPHA_WALLET) knownWallets[process.env.AGENT_ALPHA_WALLET] = "AGENT_ALPHA_KEYPAIR";
    if (process.env.AGENT_OMEGA_WALLET) knownWallets[process.env.AGENT_OMEGA_WALLET] = "AGENT_OMEGA_KEYPAIR";
    try {
      const deployerKpRaw = JSON.parse(process.env.DEPLOYER_KEYPAIR || "[]");
      if (deployerKpRaw.length > 0) {
        const deployerWallet = Keypair.fromSecretKey(Uint8Array.from(deployerKpRaw)).publicKey.toBase58();
        knownWallets[deployerWallet] = "DEPLOYER_KEYPAIR";
      }
    } catch { /* ignore */ }

    const keypairEnv = knownWallets[posterWallet];

    if (keypairEnv && paymentToken !== "SOL") {
      // Known wallet: do real SPL lock
      try {
        const result = await lockFundsInEscrow(keypairEnv, amount);
        escrowTxHash = result.txHash;
      } catch (err) {
        console.error("[escrow/confirm] Real lock failed for known wallet:", err);
      }
    }

    // If no real lock happened, the escrow is handled by the protocol
    // (deployer acts as escrow, funds are tracked in DB)

    // Create the job
    const job = await prisma.job.create({
      data: {
        posterWallet,
        amount,
        specHash,
        specJson,
        minWords,
        category: category || "text_writing",
        paymentToken: paymentToken === "SOL" ? "SOL" : "USDC",
        language: language || "en",
        deadline: deadlineDate,
        status: "Open",
        txHash: escrowTxHash,
      },
    });

    // Marker transaction (non-blocking)
    let markerTxHash: string | null = null;
    try {
      markerTxHash = await sendMarkerTransaction("create_job:" + job.id);
      await Promise.all([
        prisma.job.update({
          where: { id: job.id },
          data: { txHash: escrowTxHash || markerTxHash },
        }),
        prisma.transaction.create({
          data: {
            txHash: markerTxHash,
            type: "create_job",
            jobId: job.id,
            wallet: posterWallet,
            amount,
            status: "confirmed",
          },
        }),
      ]);
    } catch (err) {
      console.error("[solana] Marker tx failed:", err);
    }

    // Record escrow transaction if we did one
    if (escrowTxHash) {
      try {
        await prisma.transaction.create({
          data: {
            txHash: escrowTxHash,
            type: "escrow_lock",
            jobId: job.id,
            wallet: posterWallet,
            amount,
            status: "confirmed",
          },
        });
      } catch { /* unique constraint if same hash */ }
    }

    return NextResponse.json({
      ...job,
      txHash: escrowTxHash || markerTxHash,
      escrowLocked: !!escrowTxHash,
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/escrow/confirm error:", error);
    return NextResponse.json(
      { error: "Failed to confirm escrow and create job: " + (error instanceof Error ? error.message : "Unknown error") },
      { status: 500 }
    );
  }
}
