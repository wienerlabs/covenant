import { NextRequest, NextResponse } from "next/server";
import { blockSimulatedRouteIfOnchain } from "@/lib/settlement";
import { prisma } from "@/lib/prisma";
import { sendMarkerTransaction } from "@/lib/solana";
import { PublicKey } from "@solana/web3.js";
import {
  fetchJobEscrow,
  deriveJobPda,
  verifyTxInvokedCovenant,
} from "@/lib/program-server";
import { checkAcceptJob } from "@/lib/onchain-verify";
import { classifySolanaError } from "@/lib/solana-errors";
import { requireAuth, requireWalletMatch } from "@/lib/require-auth";
import { log } from "@/lib/logger";

/**
 * POST /api/jobs/[id]/accept
 *
 * Competitive multi-taker: multiple agents can accept the same job.
 * Each acceptance creates a JobInterest row (status: "working").
 * The first taker to successfully submit_work wins; all other
 * interests transition to "withdrawn".
 *
 * On-chain accept_job is NOT called here (it was previously).
 * Instead, the on-chain accept + submit happens atomically at
 * submit_work time, so the on-chain taker field always matches
 * the actual winner — no stale assignment.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const blocked = blockSimulatedRouteIfOnchain("POST /api/jobs/[id]/accept");
  if (blocked) return blocked;

  const reqLog = log.forRequest(request); // C-110: correlate this request
  // Read the raw body so the signature binds to it (C-091): requireAuth hashes
  // the exact bytes the client signed. request.json() can only be read once.
  const __raw = await request.text();
  const __auth = await requireAuth(request, { rawBody: __raw });
  if (!__auth.ok)
    return NextResponse.json({ error: __auth.reason }, { status: __auth.status });

  try {
    const { id } = await params;
    const body = __raw ? JSON.parse(__raw) : {};
    const { takerWallet, txHash: acceptTxHash } = body;

    if (!takerWallet || typeof takerWallet !== "string") {
      return NextResponse.json(
        { error: "takerWallet is required" },
        { status: 400 },
      );
    }

    // IDOR bind: the signer must control the taker wallet they accept under.
    const __guard = requireWalletMatch(__auth, takerWallet);
    if (!__guard.ok)
      return NextResponse.json({ error: __guard.reason }, { status: __guard.status });

    const job = await prisma.job.findUnique({
      where: { id },
      include: { interests: true },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Allow accept on Open AND Accepted (multi-taker)
    if (!["Open", "Accepted"].includes(job.status)) {
      return NextResponse.json(
        { error: `Job is in status '${job.status}'; only Open or Accepted jobs can be joined` },
        { status: 400 },
      );
    }

    if (new Date() > job.deadline) {
      return NextResponse.json(
        { error: "Job deadline has passed" },
        { status: 400 },
      );
    }

    if (job.posterWallet === takerWallet) {
      return NextResponse.json(
        { error: "Poster cannot accept their own job" },
        { status: 400 },
      );
    }

    // Check if this taker already accepted
    const existing = job.interests.find((i) => i.takerWallet === takerWallet);
    if (existing) {
      return NextResponse.json(
        { error: "You already accepted this job", interest: existing },
        { status: 409 },
      );
    }

    // C-012b: when the taker signed accept_job on chain (passes a txHash),
    // mirror only after confirming the on-chain JobEscrow binds them as taker
    // and is Accepted. A mismatched submitter is rejected — no DB row written.
    if (acceptTxHash && typeof acceptTxHash === "string") {
      try {
        await verifyTxInvokedCovenant(acceptTxHash);
        const jobPda = job.pda
          ? new PublicKey(job.pda)
          : deriveJobPda(
              new PublicKey(job.posterWallet),
              Buffer.from(job.specHash, "hex"),
            )[0];
        const escrow = await fetchJobEscrow(jobPda);
        const verdict = checkAcceptJob(escrow, takerWallet);
        if (!verdict.ok) {
          return NextResponse.json(
            { error: `accept_job verification failed: ${verdict.reason}` },
            { status: 400 },
          );
        }
      } catch (err) {
        const cls = classifySolanaError(err);
        return NextResponse.json(
          {
            error: "accept_job verification failed. No DB row written.",
            detail: err instanceof Error ? err.message : String(err),
            failureMode: cls.mode,
            retryable: cls.retryable,
          },
          { status: cls.mode === "rate_limited" ? 503 : 400 },
        );
      }
    }

    // Create interest + update job status atomically
    const [interest, updatedJob] = await prisma.$transaction(async (tx) => {
      const i = await tx.jobInterest.create({
        data: {
          jobId: id,
          takerWallet,
        },
      });

      // First taker sets the job to Accepted and becomes the primary
      // (for backwards compat with UI that reads takerWallet).
      // Subsequent takers are tracked in JobInterest only.
      const isFirst = job.status === "Open";
      const j = await tx.job.update({
        where: { id },
        data: {
          status: "Accepted",
          ...(isFirst ? { takerWallet } : {}),
        },
        include: { interests: true },
      });

      return [i, j];
    });

    // Count active workers
    const activeWorkers = updatedJob.interests.filter(
      (i) => i.status === "working",
    ).length;

    // Best-effort marker tx
    let txHash: string | null = null;
    try {
      txHash = await sendMarkerTransaction("accept_job:" + id);
      reqLog.info("accept_job tx", { jobId: id, txHash }); // C-110: tx sig logged
      await prisma.transaction.create({
        data: {
          txHash,
          type: "accept_job",
          jobId: id,
          wallet: takerWallet,
          amount: job.amount,
          status: "confirmed",
        },
      });
    } catch (err) {
      console.error("[solana] Marker tx failed:", err);
    }

    return NextResponse.json({
      ...updatedJob,
      txHash,
      interest,
      activeWorkers,
      message:
        activeWorkers > 1
          ? `You joined ${activeWorkers - 1} other agent${activeWorkers > 2 ? "s" : ""} working on this job. First to deliver wins.`
          : "Job accepted! You're the first agent working on this.",
    });
  } catch (error) {
    console.error("POST /api/jobs/[id]/accept error:", error);
    return NextResponse.json(
      { error: "Failed to accept job" },
      { status: 500 },
    );
  }
}
