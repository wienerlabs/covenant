import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  botFinalizePayment,
  keypairFromEnv,
} from "@/lib/program-server";
import { PublicKey } from "@solana/web3.js";

// Always dynamic — this route talks to Prisma on every request.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// On-chain crank for the permissionless `finalize_payment` instruction.
// The crank only pays SOL fees; it cannot redirect funds because the
// program enforces taker payment to the registered taker. We prefer a
// dedicated CRANK_KEYPAIR if set, falling back to DEPLOYER_KEYPAIR.

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
  if (!CRON_SECRET) return false;
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

  const crankEnv = process.env.CRANK_KEYPAIR ? "CRANK_KEYPAIR" : "DEPLOYER_KEYPAIR";
  let crankKp;
  try {
    crankKp = keypairFromEnv(crankEnv);
  } catch (err) {
    return NextResponse.json(
      { error: `Crank keypair (${crankEnv}) not configured: ${(err as Error).message}` },
      { status: 503 },
    );
  }

  for (const job of candidates) {
    if (!job.takerWallet) {
      results.push({ jobId: job.id, ok: false, error: "no taker wallet" });
      continue;
    }
    if (!job.pda || !job.escrowAta) {
      // Pre-refactor jobs without on-chain backing — flag and skip.
      results.push({
        jobId: job.id,
        ok: false,
        error: "missing on-chain pda/escrowAta (legacy custodial job)",
      });
      continue;
    }
    try {
      const txHash = await botFinalizePayment({
        crankKeypair: crankKp,
        poster: new PublicKey(job.posterWallet),
        taker: new PublicKey(job.takerWallet),
        specHash: Buffer.from(job.specHash, "hex"),
        escrowTokenAccount: new PublicKey(job.escrowAta),
      });
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
