import { NextRequest, NextResponse } from "next/server";
import { blockSimulatedRouteIfOnchain } from "@/lib/settlement";
import { prisma } from "@/lib/prisma";
import { sendMarkerTransaction } from "@/lib/solana";
import { computeWorkMetrics } from "@/lib/work-metrics";
import {
  fetchJobEscrow,
  verifyTxInvokedCovenant,
} from "@/lib/program-server";
import { PublicKey } from "@solana/web3.js";
import crypto from "crypto";
import { requireAuth } from "@/lib/require-auth";
import { log } from "@/lib/logger";

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
  const blocked = blockSimulatedRouteIfOnchain("POST /api/jobs/[id]/submit");
  if (blocked) return blocked;

  const reqLog = log.forRequest(request); // C-110: correlate this request
  const __auth = await requireAuth(request); // C-091: verified signature or API key
  if (!__auth.ok)
    return NextResponse.json({ error: __auth.reason }, { status: __auth.status });

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

    // ---- On-chain commitment verification ----
    //
    // If the taker is a human wallet, they MUST have already invoked
    // the on-chain `submit_work` instruction from their browser and
    // pass us the resulting tx signature. We verify and check the
    // JobEscrow PDA reflects the work_hash we computed. This blocks
    // a malicious frontend from claiming "delivered" without an
    // on-chain commitment.
    //
    // For headless bot taker flows (arena/battle/autonomous) the
    // commitmentTxHash may be absent — in that case we record DB-only
    // and the bot is expected to call submit_work via the server
    // bot-signing helper before finalize_payment runs. Such jobs can
    // never settle real USDC because the on-chain status would still
    // be Accepted, not Delivered, and finalize would revert.
    const isHumanFlow = !job.posterWallet.startsWith("covenant-agent-");
    if (commitmentTxHash) {
      try {
        await verifyTxInvokedCovenant(commitmentTxHash);
        if (job.pda) {
          const onchain = await fetchJobEscrow(new PublicKey(job.pda));
          if (!onchain) {
            throw new Error(
              `JobEscrow PDA ${job.pda.slice(0, 8)}… not found on chain.`,
            );
          }
          if (onchain.status !== "Delivered") {
            throw new Error(
              `On-chain JobEscrow status is '${onchain.status}'; expected 'Delivered'. ` +
              `Either the supplied tx is not a successful submit_work, or it was for a different spec.`,
            );
          }
          if (onchain.workHashHex.toLowerCase() !== metrics.workHash.toLowerCase()) {
            throw new Error(
              `On-chain work_hash mismatch: expected ${metrics.workHash.slice(0, 12)}…, ` +
              `got ${onchain.workHashHex.slice(0, 12)}…`,
            );
          }
        }
      } catch (err) {
        console.error("[submit] on-chain verification failed:", err);
        return NextResponse.json(
          {
            error: "submit_work tx verification failed: " +
              (err instanceof Error ? err.message : String(err)),
          },
          { status: 400 },
        );
      }
    } else if (isHumanFlow) {
      return NextResponse.json(
        {
          error:
            "commitmentTxHash is required for human-wallet jobs. The taker must invoke " +
            "submit_work on chain via @solana/anchor-browser before calling this endpoint.",
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
      reqLog.info("submit_work tx", { jobId: id, txHash }); // C-110: tx sig logged
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
