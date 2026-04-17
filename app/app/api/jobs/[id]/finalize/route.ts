import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMarkerTransaction } from "@/lib/solana";
import { awardXP, XP_REWARDS } from "@/lib/xp";
import { checkAndUnlock } from "@/lib/achievements";
import { PROTOCOL_FEE_BPS } from "@/lib/constants";
import {
  botFinalizePayment,
  fetchJobEscrow,
  verifyTxInvokedCovenant,
  keypairFromEnv,
} from "@/lib/program-server";
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

    // ---- On-chain finalize ----
    //
    // Two acceptable inputs:
    //   (A) Caller already invoked the on-chain `finalize_payment`
    //       crank from their browser (or a server) and passes
    //       `txSignature` in the body. We verify and mirror.
    //   (B) Caller asks the server to crank for them. We use the
    //       configured CRANK_KEYPAIR (or DEPLOYER_KEYPAIR fallback)
    //       and call `finalize_payment` on chain. The crank's only
    //       privilege is paying SOL fees — it cannot redirect funds
    //       (the program enforces taker payment to the registered taker).
    //
    // Either way, no shared deployer wallet ever holds user USDC.

    const isAgentJob = job.takerWallet.startsWith("covenant-agent-");
    const callerTxSig = (body as { txSignature?: string }).txSignature;

    let paymentTxHash: string | null = null;

    if (isAgentJob) {
      // Synthetic agent jobs (battle/arena demos that did not lock real
      // USDC) just record completion — no on-chain settlement to do.
      paymentTxHash = "agent:finalized:" + crypto.randomBytes(12).toString("hex");
    } else if (callerTxSig) {
      // Path A: client-cranked. Verify the tx and mirror.
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
      // Path B: server-cranked. Use CRANK_KEYPAIR if configured, else
      // fall back to DEPLOYER_KEYPAIR. Crank only pays fees — it cannot
      // redirect funds because the on-chain program enforces the taker.
      const crankEnv = process.env.CRANK_KEYPAIR ? "CRANK_KEYPAIR" : "DEPLOYER_KEYPAIR";
      try {
        if (!job.pda || !job.escrowAta) {
          throw new Error(
            "Job is missing on-chain PDA / escrowAta; cannot run server crank. " +
            "Caller should pass txSignature after invoking finalize_payment client-side.",
          );
        }
        const crankKp = keypairFromEnv(crankEnv);
        // Need spec_hash bytes for PDA derivation — re-derive from DB.
        const specHashBuf = Buffer.from(job.specHash, "hex");
        const sig = await botFinalizePayment({
          crankKeypair: crankKp,
          poster: new PublicKey(job.posterWallet),
          taker: new PublicKey(job.takerWallet),
          specHash: specHashBuf,
          escrowTokenAccount: new PublicKey(job.escrowAta),
        });
        paymentTxHash = sig;
      } catch (err) {
        console.error("[finalize] server crank failed:", err);
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
