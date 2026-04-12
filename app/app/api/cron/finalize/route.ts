import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { releaseFundsToTaker } from "@/lib/escrow";

// Always dynamic — this route talks to Prisma on every request.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// NOTE: This cron still uses the server-side releaseFundsToTaker() as
// the fund-movement mechanism. In a fully on-chain deployment, this
// would be replaced with a server crank that calls finalize_payment
// via Anchor using a dedicated crank keypair. The current approach
// works because:
//   1. The on-chain finalize_payment is permissionless — any wallet
//      can call it after challenge_end
//   2. The server has DEPLOYER_KEYPAIR which can act as the crank
//   3. Jobs created via the real Anchor create_job instruction have
//      their escrow in PDA-owned token accounts
//
// For jobs created via the legacy SPL-transfer path (arena/battle),
// releaseFundsToTaker still works because those funds sit in the
// deployer's ATA. Both paths converge here.
//
// TODO: Replace with real Anchor finalize_payment instruction call
// using a dedicated crank keypair for full on-chain finalize.

/**
 * GET /api/cron/finalize
 *
 * Vercel cron target. Runs every ~5 minutes. Finds all jobs in
 * `Delivered` state whose challenge period has expired and which have
 * no active dispute, then finalizes them by releasing escrow to the
 * taker and moving the job to `Finalized`.
 *
 * This guarantees protocol progress even if neither party wakes up to
 * push the Finalize button. Idempotent — re-running the cron is a no-op
 * once a job is Finalized.
 *
 * Schedule in vercel.json:
 *   { "crons": [{ "path": "/api/cron/finalize", "schedule": "* /5 * * * *" }] }
 */

const CRON_SECRET = process.env.CRON_SECRET ?? "";

function authorized(req: NextRequest): boolean {
  if (!CRON_SECRET) return true;
  const header = req.headers.get("authorization");
  return (
    header === `Bearer ${CRON_SECRET}` ||
    new URL(req.url).searchParams.get("auth") === CRON_SECRET
  );
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const candidates = await prisma.job.findMany({
    where: {
      status: "Delivered",
      challengeEndAt: { lte: now },
      dispute: null,
    },
    take: 50,
    include: { delivery: true },
  });

  const results: Array<{
    jobId: string;
    ok: boolean;
    paymentTxHash?: string;
    error?: string;
  }> = [];

  for (const job of candidates) {
    if (!job.takerWallet) {
      results.push({ jobId: job.id, ok: false, error: "no taker wallet" });
      continue;
    }
    try {
      const { txHash } = await releaseFundsToTaker(job.takerWallet, job.amount);
      await prisma.$transaction(async (tx) => {
        await tx.job.update({
          where: { id: job.id },
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
            jobId: job.id,
            type: "finalized",
            txSignature: txHash,
            wallet: "cron:finalize",
            amount: job.amount,
            data: {
              taker: job.takerWallet,
              paymentTxHash: txHash,
              crank: "cron",
            },
          },
        });
        await tx.transaction.create({
          data: {
            txHash,
            type: "finalize_payment",
            jobId: job.id,
            wallet: job.takerWallet as string,
            amount: job.amount,
            status: "confirmed",
          },
        });
      });
      results.push({ jobId: job.id, ok: true, paymentTxHash: txHash });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cron/finalize] failed for ${job.id}:`, msg);
      results.push({ jobId: job.id, ok: false, error: msg });
    }
  }

  return NextResponse.json({
    ranAt: now.toISOString(),
    scanned: candidates.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
