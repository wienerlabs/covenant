import { NextRequest, NextResponse } from "next/server";
import { blockSimulatedRouteIfOnchain } from "@/lib/settlement";
import { prisma } from "@/lib/prisma";
import { sendMarkerTransaction } from "@/lib/solana";
import { awardXP, XP_REWARDS } from "@/lib/xp";
import { checkAndUnlock } from "@/lib/achievements";
import { PROTOCOL_FEE_BPS } from "@/lib/constants";
import { fetchJobEscrow, verifyTxInvokedCovenant } from "@/lib/program-server";
import { finalizeWithClaim, keypairFromEnv } from "@/lib/credit-server";
import { PublicKey } from "@solana/web3.js";
import crypto from "crypto";
import { requireAuth } from "@/lib/require-auth";
import { log } from "@/lib/logger";
import { alertCrankFailure } from "@/lib/alerts";

/**
 * POST /api/jobs/[id]/finalize
 *
 * Permissionless. Anyone can call this after the challenge period has
 * expired and no dispute is active. The server re-checks on-chain /
 * database state, releases escrow to the taker (or to the claim buyer
 * if a Covenant Credit listing has been Bought), and moves the job to
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
  const blocked = blockSimulatedRouteIfOnchain("POST /api/jobs/[id]/finalize");
  if (blocked) return blocked;

  // C-110: correlate this request. C-091: finalize is permissionless by design
  // (anyone may settle after the challenge period), so auth is opt-in — a no-op
  // unless the operator sets AUTH_ENFORCED, in which case the frontend signs and
  // a keeper bot presents an API key.
  const reqLog = log.forRequest(request);
  const __auth = await requireAuth(request);
  if (!__auth.ok)
    return NextResponse.json({ error: __auth.reason }, { status: __auth.status });

  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      callerWallet?: string;
      txSignature?: string;
    };
    const caller = body.callerWallet ?? "anonymous";
    const callerTxSig = body.txSignature;

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

    // ---- On-chain finalize ----
    //
    // Three paths:
    //   A. Synthetic agent job: no funds to move, just a marker.
    //   B. Caller already invoked the on-chain `finalize_payment` crank
    //      from their browser and passes `txSignature` in the body.
    //      Verify tx + check on-chain JobEscrow.status == Finalized.
    //   C. Server-cranked via lib/credit-server.finalizeWithClaim —
    //      claim-aware: routes proceeds to the buyer if a ClaimListing
    //      is Bought, otherwise to the taker. Crank pays only SOL fees;
    //      the program enforces the beneficiary.
    //
    // The server NEVER signs a custodial release tx here. The previous
    // `releaseFundsToTaker` custodial path was removed in the on-chain
    // settlement refactor (audit C-01).
    const isAgentJob = job.takerWallet.startsWith("covenant-agent-");
    let paymentTxHash: string | null = null;
    let routedToBuyer = false;
    let settlementBuyer: string | null = null;

    if (isAgentJob) {
      // Path A — synthetic agent job, record-only marker.
      paymentTxHash = "agent:finalized:" + crypto.randomBytes(12).toString("hex");
    } else if (callerTxSig) {
      // Path B — client-cranked. Verify the tx landed + invoked our
      // program + the JobEscrow status is now Finalized.
      try {
        await verifyTxInvokedCovenant(callerTxSig);
        if (job.pda) {
          const onchain = await fetchJobEscrow(new PublicKey(job.pda));
          if (onchain && onchain.status !== "Finalized") {
            throw new Error(
              `On-chain JobEscrow status is ${onchain.status}; expected Finalized after the crank tx.`,
            );
          }
        }
        paymentTxHash = callerTxSig;
      } catch (err) {
        console.error("[finalize] client-cranked verify failed:", err);
        return NextResponse.json(
          {
            error: "Finalize tx verification failed: " +
              (err instanceof Error ? err.message : String(err)),
          },
          { status: 400 },
        );
      }
    } else {
      // Path C — server-cranked, claim-aware.
      if (!job.pda || !job.escrowAta) {
        return NextResponse.json(
          {
            error:
              "Job is missing on-chain PDA / escrowAta; cannot run server crank. " +
              "Invoke finalize_payment from a wallet and POST back with txSignature instead.",
          },
          { status: 400 },
        );
      }
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
        reqLog.info("finalize_payment settled", { jobId: id, txHash: paymentTxHash }); // C-110: on-chain tx sig logged
        routedToBuyer = result.routedToBuyer;
        settlementBuyer = result.buyer;
      } catch (err) {
        console.error("[finalize] server crank failed:", err);
        void alertCrankFailure(id, err instanceof Error ? err.message : String(err)); // C-112
        return NextResponse.json(
          {
            error:
              "Server-side crank failed; funds remain locked. " +
              "Caller can retry by invoking finalize_payment from a wallet and " +
              "passing txSignature in this request body.",
            detail: err instanceof Error ? err.message : String(err),
          },
          { status: 500 },
        );
      }
    }

    // Atomically mark the DB row Finalized once the on-chain settlement
    // is confirmed. If another concurrent request beat us to it, we
    // still return success (idempotent) since the chain is the truth.
    const claimed = await prisma.job.updateMany({
      where: { id, status: "Delivered" },
      data: { status: "Finalized" },
    });
    if (claimed.count === 0) {
      return NextResponse.json({
        job: { id, status: "Finalized" },
        paymentTxHash,
        finalizedBy: caller,
        note: "already-finalized",
      });
    }

    // Mirror Covenant Credit settlement if the payout was routed.
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

    // Protocol fee, recorded only. Devnet escrow does not deduct it
    // on chain; the field exists so analytics + audits can track it.
    const feeAmount = (job.amount * PROTOCOL_FEE_BPS) / 10000;
    const takerPayout = job.amount - feeAmount;
    console.log(`[finalize] fee=${feeAmount} takerPayout=${takerPayout} job=${id}`);

    // Update related DB records.
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
            routedToBuyer,
            buyer: settlementBuyer,
          },
        },
      });
      await tx.transaction.create({
        data: {
          txHash:
            paymentTxHash ?? "local:finalized:" + crypto.randomBytes(12).toString("hex"),
          type: "finalize_payment",
          jobId: id,
          wallet: (routedToBuyer && settlementBuyer) || caller,
          amount: job.amount,
          status: "confirmed",
        },
      });
      // Record protocol fee.
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

    // Award XP + check achievements (best effort).
    try {
      await awardXP(job.posterWallet, XP_REWARDS.job_finalize, "job_finalize");
      if (!isAgentJob) {
        await awardXP(job.takerWallet, XP_REWARDS.job_complete, "job_complete");
      }
      await checkAndUnlock(job.posterWallet);
      if (!isAgentJob) await checkAndUnlock(job.takerWallet);
    } catch { /* best effort */ }

    // Best-effort Solana marker.
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
      routedToBuyer,
      settlementBuyer,
    });
  } catch (error) {
    console.error("POST /api/jobs/[id]/finalize error:", error);
    return NextResponse.json(
      { error: "Failed to finalize payment" },
      { status: 500 },
    );
  }
}
