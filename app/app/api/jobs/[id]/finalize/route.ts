import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMarkerTransaction } from "@/lib/solana";
import { releaseFundsToTaker } from "@/lib/escrow";
import crypto from "crypto";

/**
 * POST /api/jobs/[id]/finalize
 *
 * Permissionless. Anyone can call this after the challenge period has
 * expired and no dispute is active. The server re-checks on-chain /
 * database state, releases escrow to the taker, and moves the job to
 * Finalized.
 *
 * In a production deployment this endpoint is called by a cron worker
 * (see /api/cron/finalize), but the frontend also exposes a "Finalize
 * now" button once the countdown reaches zero.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      callerWallet?: string;
    };
    const caller = body.callerWallet ?? "anonymous";

    const job = await prisma.job.findUnique({
      where: { id },
      include: { delivery: true, dispute: true },
    });
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (job.status !== "Delivered") {
      return NextResponse.json(
        {
          error: `Job is in status '${job.status}'; finalize requires 'Delivered'`,
        },
        { status: 400 },
      );
    }
    if (job.dispute) {
      return NextResponse.json(
        { error: "Cannot finalize: dispute is active" },
        { status: 409 },
      );
    }
    if (!job.challengeEndAt || job.challengeEndAt.getTime() > Date.now()) {
      const remaining = job.challengeEndAt
        ? Math.max(0, job.challengeEndAt.getTime() - Date.now())
        : 0;
      return NextResponse.json(
        {
          error: "Challenge period has not expired yet",
          remainingMs: remaining,
          challengeEndAt: job.challengeEndAt?.toISOString(),
        },
        { status: 425 }, // "Too Early"
      );
    }
    if (!job.takerWallet) {
      return NextResponse.json(
        { error: "Job has no taker to pay" },
        { status: 500 },
      );
    }

    // 1. Release escrow
    let paymentTxHash: string | null = null;
    try {
      const result = await releaseFundsToTaker(job.takerWallet, job.amount);
      paymentTxHash = result.txHash;
    } catch (err) {
      console.error("[finalize] escrow release failed:", err);
      return NextResponse.json(
        {
          error:
            "Escrow release failed; funds remain locked. Manual intervention required.",
          detail: err instanceof Error ? err.message : String(err),
        },
        { status: 500 },
      );
    }

    // 2. Update DB
    const updated = await prisma.$transaction(async (tx) => {
      const j = await tx.job.update({
        where: { id },
        data: { status: "Finalized" },
      });
      await tx.reputation.upsert({
        where: { walletAddress: job.takerWallet as string },
        create: {
          walletAddress: job.takerWallet as string,
          jobsCompleted: 1,
          totalEarned: job.amount,
          firstJobAt: new Date(),
        },
        update: {
          jobsCompleted: { increment: 1 },
          totalEarned: { increment: job.amount },
        },
      });
      await tx.jobEvent.create({
        data: {
          jobId: id,
          type: "finalized",
          txSignature:
            paymentTxHash ?? "local:finalized:" + crypto.randomBytes(12).toString("hex"),
          wallet: caller,
          amount: job.amount,
          data: {
            taker: job.takerWallet,
            crank: caller,
            paymentTxHash,
          },
        },
      });
      await tx.transaction.create({
        data: {
          txHash:
            paymentTxHash ?? "local:finalized:" + crypto.randomBytes(12).toString("hex"),
          type: "finalize_payment",
          jobId: id,
          wallet: caller,
          amount: job.amount,
          status: "confirmed",
        },
      });
      return j;
    });

    // Best-effort Solana marker
    try {
      const markerTx = await sendMarkerTransaction("finalize_payment:" + id);
      console.log("[finalize] marker tx:", markerTx);
    } catch (err) {
      console.error("[finalize] marker failed:", err);
    }

    return NextResponse.json({
      job: updated,
      paymentTxHash,
      finalizedBy: caller,
    });
  } catch (error) {
    console.error("POST /api/jobs/[id]/finalize error:", error);
    return NextResponse.json(
      { error: "Failed to finalize payment" },
      { status: 500 },
    );
  }
}
