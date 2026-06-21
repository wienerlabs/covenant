import { NextRequest, NextResponse } from "next/server";
import { blockSimulatedRouteIfOnchain } from "@/lib/settlement";
import { prisma } from "@/lib/prisma";
import { sendMarkerTransaction } from "@/lib/solana";
import {
  fetchJobEscrow,
  verifyTxInvokedCovenant,
} from "@/lib/program-server";
import { PublicKey } from "@solana/web3.js";
import { requireAuth, requireWalletMatch } from "@/lib/require-auth";
import { log } from "@/lib/logger";

/**
 * POST /api/jobs/[id]/cancel
 *
 * Cancellation now goes fully through the on-chain `cancel_job`
 * instruction. The caller must have already invoked it from their
 * wallet and passes the resulting tx signature in `txHash`.
 *
 * Body: { signerWallet, txHash }
 *
 * The on-chain program enforces who is allowed to cancel and when:
 *   - Open  : only poster
 *   - Accepted, past deadline: poster OR taker
 * We mirror its decision instead of duplicating it server-side, so
 * permissions cannot drift between layers.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const blocked = blockSimulatedRouteIfOnchain("POST /api/jobs/[id]/cancel");
  if (blocked) return blocked;

  const reqLog = log.forRequest(request); // C-110: correlate this request
  const __raw = await request.text();
  const __auth = await requireAuth(request, { rawBody: __raw }); // C-091
  if (!__auth.ok)
    return NextResponse.json({ error: __auth.reason }, { status: __auth.status });

  try {
    const { id } = await params;
    const body = __raw ? JSON.parse(__raw) : {};
    const { signerWallet, txHash } = body as {
      signerWallet?: string;
      txHash?: string;
    };

    if (!signerWallet || typeof signerWallet !== "string") {
      return NextResponse.json(
        { error: "signerWallet is required" },
        { status: 400 },
      );
    }

    // IDOR bind: the signer must control the wallet they cancel as. (The
    // on-chain program is the source of truth for who may cancel; this stops
    // a forged DB-mirror under someone else's wallet once enforced.)
    const __guard = requireWalletMatch(__auth, signerWallet);
    if (!__guard.ok)
      return NextResponse.json({ error: __guard.reason }, { status: __guard.status });
    if (!txHash) {
      return NextResponse.json(
        {
          error:
            "txHash (on-chain cancel_job tx signature) is required. " +
            "Invoke cancel_job from your wallet via @solana/anchor-browser before calling this endpoint.",
        },
        { status: 400 },
      );
    }

    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (job.status === "Cancelled") {
      // Idempotent — already cancelled, just return current row.
      return NextResponse.json({ ...job, note: "already-cancelled" });
    }

    // Verify the on-chain tx and confirm the JobEscrow PDA is now in
    // the Cancelled state. The program does the access-control work.
    try {
      await verifyTxInvokedCovenant(txHash);
      if (job.pda) {
        const onchain = await fetchJobEscrow(new PublicKey(job.pda));
        if (onchain && onchain.status !== "Cancelled") {
          throw new Error(
            `On-chain JobEscrow status is '${onchain.status}'; expected 'Cancelled'.`,
          );
        }
        // If the PDA is gone (close = poster directive) treat as cancelled too.
      }
    } catch (err) {
      console.error("[cancel] on-chain verification failed:", err);
      return NextResponse.json(
        {
          error: "cancel_job tx verification failed: " +
            (err instanceof Error ? err.message : String(err)),
        },
        { status: 400 },
      );
    }

    const updatedJob = await prisma.$transaction(async (tx) => {
      const updated = await tx.job.update({
        where: { id },
        data: { status: "Cancelled" },
      });

      // If we cancelled an Accepted-past-deadline job, the program also
      // updates taker reputation. Mirror that side effect here.
      if (job.status === "Accepted" && job.takerWallet && new Date() > job.deadline) {
        await tx.reputation.upsert({
          where: { walletAddress: job.takerWallet },
          create: {
            walletAddress: job.takerWallet,
            jobsFailed: 1,
          },
          update: {
            jobsFailed: { increment: 1 },
          },
        });
      }

      await tx.transaction.create({
        data: {
          txHash,
          type: "cancel_job",
          jobId: id,
          wallet: signerWallet,
          amount: job.amount,
          status: "confirmed",
        },
      }).catch(() => {/* unique txHash collision — ignore */});

      return updated;
    });

    reqLog.info("cancel_job tx", { jobId: id, txHash }); // C-110: on-chain tx sig logged

    // Best-effort marker (non-blocking, advisory only).
    try {
      await sendMarkerTransaction("cancel_job:" + id);
    } catch (err) {
      console.error("[solana] Failed to send marker tx for cancel_job:", err);
    }

    return NextResponse.json({ ...updatedJob, txHash });
  } catch (error) {
    console.error("POST /api/jobs/[id]/cancel error:", error);
    return NextResponse.json(
      { error: "Failed to cancel job" },
      { status: 500 },
    );
  }
}
