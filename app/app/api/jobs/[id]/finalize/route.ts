import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMarkerTransaction } from "@/lib/solana";
import { releaseFundsToTaker } from "@/lib/escrow";
import { awardXP, XP_REWARDS } from "@/lib/xp";
import { checkAndUnlock } from "@/lib/achievements";
import { PROTOCOL_FEE_BPS } from "@/lib/constants";
import {
  finalizeWithClaim,
  keypairFromEnv,
} from "@/lib/credit-server";
import { PublicKey } from "@solana/web3.js";
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

    // 1. Atomically claim the finalization (prevent double-payment race)
    const claimed = await prisma.job.updateMany({
      where: { id, status: "Delivered" },
      data: { status: "Finalized" },
    });
    if (claimed.count === 0) {
      // Another request already finalized — return success (idempotent)
      return NextResponse.json({
        job: { id, status: "Finalized" },
        paymentTxHash: "already-finalized",
        finalizedBy: caller,
      });
    }

    // 2. Release escrow. Two paths:
    //   A. On-chain: job has `pda` + `escrowAta` → use the permissionless
    //      `finalize_payment` crank via lib/credit-server.finalizeWithClaim.
    //      If a ClaimListing exists in Bought state, proceeds route to
    //      the buyer; otherwise to the taker. Reputation always credits
    //      the original taker.
    //   B. Legacy custodial: job was created before on-chain escrow
    //      landed — fall back to releaseFundsToTaker. The custodial
    //      pool still holds those funds.
    //   C. Synthetic agent job: no funds to move, just marker.
    const isAgentJob = job.takerWallet.startsWith("covenant-agent-");
    let paymentTxHash: string | null = null;
    let routedToBuyer = false;
    let settlementBuyer: string | null = null;

    if (isAgentJob) {
      paymentTxHash = "agent:finalized:" + crypto.randomBytes(12).toString("hex");
    } else if (job.pda && job.escrowAta) {
      // Path A — on-chain, claim-aware.
      try {
        const crankEnv = process.env.CRANK_KEYPAIR ? "CRANK_KEYPAIR" : "DEPLOYER_KEYPAIR";
        const crankKp = keypairFromEnv(crankEnv);
        const result = await finalizeWithClaim({
          crankKeypair: crankKp,
          poster: new PublicKey(job.posterWallet),
          taker: new PublicKey(job.takerWallet),
          specHash: Buffer.from(job.specHash, "hex"),
          escrowTokenAccount: new PublicKey(job.escrowAta),
        });
        paymentTxHash = result.sig;
        routedToBuyer = result.routedToBuyer;
        settlementBuyer = result.buyer;
      } catch (err) {
        console.error("[finalize] on-chain finalizeWithClaim failed:", err);
        await prisma.job.updateMany({
          where: { id, status: "Finalized" },
          data: { status: "Delivered" },
        });
        return NextResponse.json(
          {
            error:
              "On-chain finalize failed; funds remain locked in the PDA escrow. " +
              "Another crank (frontend or manual) can retry.",
            detail: err instanceof Error ? err.message : String(err),
          },
          { status: 500 },
        );
      }
    } else {
      // Path B — legacy custodial fallback.
      try {
        const result = await releaseFundsToTaker(job.takerWallet, job.amount);
        paymentTxHash = result.txHash;
      } catch (err) {
        console.error("[finalize] custodial release failed:", err);
        await prisma.job.updateMany({
          where: { id, status: "Finalized" },
          data: { status: "Delivered" },
        });
        return NextResponse.json(
          {
            error:
              "Escrow release failed; funds remain locked. Manual intervention required.",
            detail: err instanceof Error ? err.message : String(err),
          },
          { status: 500 },
        );
      }
    }

    // 2b. If a Covenant Credit claim was routed to a buyer, mirror the
    //     settlement into the DB so the marketplace reflects terminal
    //     state.
    if (routedToBuyer && paymentTxHash && settlementBuyer) {
      try {
        const claim = await prisma.claimListing.findUnique({
          where: { jobId: id },
        });
        if (claim && claim.status === "Bought") {
          await prisma.claimListing.update({
            where: { id: claim.id },
            data: {
              status: "Settled",
              settledAt: new Date(),
              settleTxHash: paymentTxHash,
            },
          });
        }
      } catch (err) {
        console.error("[finalize] claim settlement mirror failed:", err);
        // non-blocking
      }
    }

    // 2b. Calculate protocol fee (recorded only — on-chain deduction comes at mainnet)
    const feeAmount = (job.amount * PROTOCOL_FEE_BPS) / 10000;
    const takerPayout = job.amount - feeAmount;
    console.log(`[finalize] fee=${feeAmount} takerPayout=${takerPayout} job=${id}`);

    // 3. Update related DB records
    const updated = await prisma.$transaction(async (tx) => {
      const j = await tx.job.findUnique({ where: { id } });
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
            feeAmount,
            takerPayout,
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
      // Record protocol fee
      await tx.protocolFee.create({
        data: {
          jobId: id,
          amount: feeAmount,
          feeBps: PROTOCOL_FEE_BPS,
          paidBy: job.takerWallet as string,
        },
      });
      return j;
    });

    // Award XP + check achievements (best effort)
    try {
      await awardXP(job.posterWallet, XP_REWARDS.job_finalize, "job_finalize");
      if (!isAgentJob) {
        await awardXP(job.takerWallet, XP_REWARDS.job_complete, "job_complete");
      }
      await checkAndUnlock(job.posterWallet);
      if (!isAgentJob) await checkAndUnlock(job.takerWallet);
    } catch { /* best effort */ }

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
