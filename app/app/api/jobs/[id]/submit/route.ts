import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMarkerTransaction } from "@/lib/solana";
import { computeWorkMetrics } from "@/lib/work-metrics";
import crypto from "crypto";

/**
 * POST /api/jobs/[id]/submit
 *
 * Taker submits a delivery commitment. This replaces the old
 * submit_completion flow that released escrow immediately on a ZK proof.
 *
 * The new flow:
 *   - Compute SHA-256 hash of the content -> work_hash
 *   - Upload content to Vercel Blob (or caller supplies deliveryUri)
 *   - Record Delivery row, move Job to "Delivered" state
 *   - Start challenge period (challengeEndAt = now + challenge_period)
 *   - Escrow remains locked until finalize_payment or resolve_dispute
 *
 * Body: { takerWallet, text, deliveryUri?, outputText? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      takerWallet,
      text,
      deliveryUri: providedUri,
      outputText: bodyOutputText,
      commitmentTxHash,
      imageUrl: providedImageUrl,
    } = body as {
      takerWallet?: string;
      text?: string;
      deliveryUri?: string;
      outputText?: string;
      commitmentTxHash?: string;
      imageUrl?: string;
    };

    if (!takerWallet || typeof takerWallet !== "string") {
      return NextResponse.json(
        { error: "takerWallet is required" },
        { status: 400 },
      );
    }
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const job = await prisma.job.findUnique({
      where: { id },
      include: { delivery: true },
    });
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (!["Open", "Accepted"].includes(job.status)) {
      return NextResponse.json(
        {
          error: `Job is in status '${job.status}'; submit_work requires 'Open' or 'Accepted'`,
        },
        { status: 400 },
      );
    }
    // Multi-taker: any agent with a JobInterest can submit, OR the
    // assigned takerWallet. Check both.
    const hasInterest = await prisma.jobInterest.findUnique({
      where: { jobId_takerWallet: { jobId: id, takerWallet } },
    });
    if (!hasInterest && job.takerWallet !== takerWallet) {
      return NextResponse.json(
        { error: "Accept the job first before submitting work" },
        { status: 403 },
      );
    }
    if (job.delivery) {
      return NextResponse.json(
        { error: "Work already submitted for this job" },
        { status: 409 },
      );
    }

    // Compute work hash + metrics (no ZK; just deterministic sha256 + counting)
    const metrics = computeWorkMetrics(text, job.minWords, job.category);
    if (!metrics.quantityPass) {
      return NextResponse.json(
        {
          error: `Submitted content is below minimum for category '${job.category}': got ${metrics.wordCount}, need ${job.minWords}`,
          metrics,
        },
        { status: 400 },
      );
    }

    // Derive the delivery URI. If the caller already uploaded somewhere,
    // trust them; otherwise we inline a short data URI for the demo flow.
    // Production clients should use /api/delivery/upload first.
    const fallbackUri = `inline:${id.slice(0, 8)}`;
    const deliveryUri = providedUri ?? fallbackUri;
    if (Buffer.byteLength(deliveryUri, "utf8") > 128) {
      return NextResponse.json(
        {
          error: "deliveryUri exceeds 128 byte on-chain limit",
        },
        { status: 400 },
      );
    }

    const challengeEnd = new Date(
      Date.now() + job.challengePeriod * 1000,
    );
    const storedOutputText =
      typeof bodyOutputText === "string" ? bodyOutputText : text;

    const [delivery, updatedJob] = await prisma.$transaction(async (tx) => {
      const d = await tx.delivery.create({
        data: {
          jobId: id,
          takerWallet,
          workHash: metrics.workHash,
          deliveryUri,
          contentPreview: storedOutputText.slice(0, 2000),
          imageUrl: providedImageUrl || null,
          txHash: commitmentTxHash,
        },
      });

      // First-to-deliver wins: set this taker as the winner on the Job row
      // and withdraw all other competing interests.
      const j = await tx.job.update({
        where: { id },
        data: {
          status: "Delivered",
          takerWallet, // winner becomes the official taker
          deliveredAt: new Date(),
          challengeEndAt: challengeEnd,
        },
      });

      // Mark winner's interest as delivered, others as withdrawn
      await tx.jobInterest.updateMany({
        where: { jobId: id, takerWallet },
        data: { status: "delivered" },
      });
      await tx.jobInterest.updateMany({
        where: { jobId: id, takerWallet: { not: takerWallet } },
        data: { status: "withdrawn" },
      });

      await tx.jobEvent.create({
        data: {
          jobId: id,
          type: "delivered",
          // Use the on-chain commitment signature when available, otherwise
          // generate a local placeholder so the unique index still applies.
          txSignature:
            commitmentTxHash ??
            "local:delivered:" + crypto.randomBytes(12).toString("hex"),
          wallet: takerWallet,
          data: {
            workHash: metrics.workHash,
            deliveryUri,
            wordCount: metrics.wordCount,
            challengeEndAt: challengeEnd.toISOString(),
            commitmentTxHash: commitmentTxHash ?? null,
          },
        },
      });

      // Legacy Submission row for UI backwards-compat (dashboard / history)
      await tx.submission.create({
        data: {
          jobId: id,
          takerWallet,
          textHash: metrics.workHash,
          wordCount: metrics.wordCount,
          verified: true,
          outputText: storedOutputText,
        },
      });

      return [d, j];
    });

    // Best-effort Solana marker (non-blocking)
    let txHash: string | null = null;
    try {
      txHash = await sendMarkerTransaction("submit_work:" + id);
      await prisma.$transaction([
        prisma.delivery.update({
          where: { id: delivery.id },
          data: { txHash },
        }),
        prisma.transaction.create({
          data: {
            txHash,
            type: "submit_work",
            jobId: id,
            wallet: takerWallet,
            status: "confirmed",
          },
        }),
      ]);
    } catch (err) {
      console.error("[solana] submit_work marker failed:", err);
    }

    return NextResponse.json({
      job: updatedJob,
      delivery: { ...delivery, txHash },
      metrics,
      txHash,
      challengeEndAt: challengeEnd.toISOString(),
    });
  } catch (error) {
    console.error("POST /api/jobs/[id]/submit error:", error);
    return NextResponse.json(
      { error: "Failed to submit work" },
      { status: 500 },
    );
  }
}
