import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { releaseFundsToTaker } from "@/lib/escrow";
import {
  finalizeWithClaim,
  keypairFromEnv,
} from "@/lib/credit-server";
import { PublicKey } from "@solana/web3.js";

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

  // Load crank keypair once; fall back to DEPLOYER_KEYPAIR if not set.
  const crankEnv = process.env.CRANK_KEYPAIR ? "CRANK_KEYPAIR" : "DEPLOYER_KEYPAIR";
  let crankKp;
  try {
    crankKp = keypairFromEnv(crankEnv);
  } catch {
    crankKp = null;
  }

  for (const job of candidates) {
    if (!job.takerWallet) {
      results.push({ jobId: job.id, ok: false, error: "no taker wallet" });
      continue;
    }
    try {
      // On-chain path (claim-aware) if the job has both pda + escrowAta.
      let txHash: string;
      let routedToBuyer = false;
      let settlementBuyer: string | null = null;

      if (job.pda && job.escrowAta && crankKp) {
        const result = await finalizeWithClaim({
          crankKeypair: crankKp,
          poster: new PublicKey(job.posterWallet),
          taker: new PublicKey(job.takerWallet),
          specHash: Buffer.from(job.specHash, "hex"),
          escrowTokenAccount: new PublicKey(job.escrowAta),
        });
        txHash = result.sig;
        routedToBuyer = result.routedToBuyer;
        settlementBuyer = result.buyer;
      } else {
        // Legacy custodial path for pre-on-chain jobs.
        const r = await releaseFundsToTaker(job.takerWallet, job.amount);
        txHash = r.txHash;
      }

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
              routedToBuyer,
              buyer: settlementBuyer,
            },
          },
        });
        await tx.transaction.create({
          data: {
            txHash,
            type: "finalize_payment",
            jobId: job.id,
            wallet: (routedToBuyer && settlementBuyer) || (job.takerWallet as string),
            amount: job.amount,
            status: "confirmed",
          },
        });

        // Mirror Covenant Credit settlement.
        if (routedToBuyer && settlementBuyer) {
          const claim = await tx.claimListing.findUnique({
            where: { jobId: job.id },
          });
          if (claim && claim.status === "Bought") {
            await tx.claimListing.update({
              where: { id: claim.id },
              data: {
                status: "Settled",
                settledAt: new Date(),
                settleTxHash: txHash,
              },
            });
          }
        }
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
