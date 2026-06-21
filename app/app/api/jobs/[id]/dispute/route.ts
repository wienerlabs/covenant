import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  fetchJobEscrow,
  verifyTxInvokedCovenant,
} from "@/lib/program-server";
import { PublicKey } from "@solana/web3.js";
import crypto from "crypto";
import { requireAuth, requireWalletMatch } from "@/lib/require-auth";
import { log } from "@/lib/logger";
import { alertDisputeSpike } from "@/lib/alerts";

const DEFAULT_BOND_BPS = 1_000; // 10%
const DEFAULT_MIN_BOND_ABSOLUTE = 1; // 1 USDC

/**
 * POST /api/jobs/[id]/dispute
 *
 * Poster raises a dispute against a Delivered job within its challenge
 * window. This writes the off-chain reason + bond to the DB and expects
 * the caller to have submitted the matching `raise_dispute` on-chain
 * transaction (tx signature passed in `txHash`).
 *
 * Body: { posterWallet, reasonText, bond, txHash? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const reqLog = log.forRequest(request); // C-110: correlate this request
    const __raw = await request.text();
    const __auth = await requireAuth(request, { rawBody: __raw }); // C-091
    if (!__auth.ok)
      return NextResponse.json({ error: __auth.reason }, { status: __auth.status });
    const { id } = await params;
    const body = __raw ? JSON.parse(__raw) : {};
    const {
      posterWallet,
      reasonText,
      bond,
      txHash,
    } = body as {
      posterWallet?: string;
      reasonText?: string;
      bond?: number;
      txHash?: string;
    };

    if (!posterWallet) {
      return NextResponse.json(
        { error: "posterWallet is required" },
        { status: 400 },
      );
    }

    // IDOR bind: the signer must control the poster wallet raising the dispute.
    const __guard = requireWalletMatch(__auth, posterWallet);
    if (!__guard.ok)
      return NextResponse.json({ error: __guard.reason }, { status: __guard.status });
    if (!reasonText || reasonText.length < 10) {
      return NextResponse.json(
        { error: "reasonText must be at least 10 characters" },
        { status: 400 },
      );
    }

    const job = await prisma.job.findUnique({
      where: { id },
      include: { dispute: true },
    });
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (job.status !== "Delivered") {
      return NextResponse.json(
        {
          error: `Job is in status '${job.status}'; dispute requires 'Delivered'`,
        },
        { status: 400 },
      );
    }
    if (job.posterWallet !== posterWallet) {
      return NextResponse.json(
        { error: "Only the poster can raise a dispute" },
        { status: 403 },
      );
    }
    if (job.dispute) {
      return NextResponse.json(
        { error: "Dispute already exists for this job" },
        { status: 409 },
      );
    }
    if (!job.challengeEndAt || job.challengeEndAt.getTime() <= Date.now()) {
      return NextResponse.json(
        {
          error: "Challenge window has closed; job will auto-finalize soon",
        },
        { status: 410 },
      );
    }

    // Enforce minimum bond: max(10% of escrow, 1 USDC)
    const minBondFromBps = (job.amount * DEFAULT_BOND_BPS) / 10_000;
    const minBond = Math.max(minBondFromBps, DEFAULT_MIN_BOND_ABSOLUTE);
    const providedBond = typeof bond === "number" ? bond : minBond;
    if (providedBond < minBond) {
      return NextResponse.json(
        {
          error: `Bond of ${providedBond} is below minimum ${minBond}`,
          minBond,
        },
        { status: 400 },
      );
    }

    const reasonHash = crypto
      .createHash("sha256")
      .update(reasonText, "utf8")
      .digest("hex");

    // ---- On-chain raise_dispute verification ----
    //
    // Disputed status (and the bonded escrow) is meaningful only if
    // the on-chain `raise_dispute` instruction actually ran. Require
    // a confirmed tx signature from the poster's wallet and verify
    // the JobEscrow PDA is now in 'Disputed' state with a matching
    // reason hash + bond.
    if (!txHash) {
      return NextResponse.json(
        {
          error:
            "txHash (on-chain raise_dispute tx signature) is required. " +
            "The poster must invoke raise_dispute from their wallet before calling this endpoint.",
        },
        { status: 400 },
      );
    }
    try {
      await verifyTxInvokedCovenant(txHash);
      if (job.pda) {
        const onchain = await fetchJobEscrow(new PublicKey(job.pda));
        if (!onchain) {
          throw new Error(
            `JobEscrow PDA ${job.pda.slice(0, 8)}… not found on chain.`,
          );
        }
        if (onchain.status !== "Disputed") {
          throw new Error(
            `On-chain JobEscrow status is '${onchain.status}'; expected 'Disputed'.`,
          );
        }
        if (onchain.dispute.reasonHashHex.toLowerCase() !== reasonHash.toLowerCase()) {
          throw new Error(
            "On-chain dispute reason_hash does not match the supplied reasonText.",
          );
        }
        if (Math.abs(onchain.dispute.bond - providedBond) > 1e-6) {
          throw new Error(
            `On-chain dispute bond ${onchain.dispute.bond} does not match supplied bond ${providedBond}.`,
          );
        }
      }
    } catch (err) {
      console.error("[dispute] on-chain verification failed:", err);
      return NextResponse.json(
        {
          error: "raise_dispute tx verification failed: " +
            (err instanceof Error ? err.message : String(err)),
        },
        { status: 400 },
      );
    }

    const dispute = await prisma.$transaction(async (tx) => {
      const d = await tx.dispute.create({
        data: {
          jobId: id,
          challenger: posterWallet,
          bond: providedBond,
          reasonHash,
          reasonText,
          txHashRaise: txHash,
          resolution: "Pending",
        },
      });
      await tx.job.update({
        where: { id },
        data: { status: "Disputed" },
      });
      await tx.jobEvent.create({
        data: {
          jobId: id,
          type: "disputed",
          txSignature:
            txHash ?? "local:disputed:" + crypto.randomBytes(12).toString("hex"),
          wallet: posterWallet,
          amount: providedBond,
          data: {
            reasonHash,
            bond: providedBond,
            challenger: posterWallet,
          },
        },
      });
      return d;
    });

    reqLog.info("dispute raised", { jobId: id, bond: providedBond, txHash }); // C-110: tx sig logged

    // C-112: dispute-spike detection. Gated on ALERT_WEBHOOK_URL so the extra
    // COUNT only runs when alerting is actually configured.
    if (process.env.ALERT_WEBHOOK_URL) {
      const WINDOW_MIN = 10;
      const since = new Date(Date.now() - WINDOW_MIN * 60_000);
      const recent = await prisma.dispute
        .count({ where: { raisedAt: { gte: since } } })
        .catch(() => 0);
      const threshold = Number(process.env.ALERT_DISPUTE_SPIKE ?? 5);
      if (recent >= threshold) void alertDisputeSpike(recent, WINDOW_MIN);
    }

    return NextResponse.json({
      dispute,
      reasonHash,
      minBond,
    });
  } catch (error) {
    console.error("POST /api/jobs/[id]/dispute error:", error);
    return NextResponse.json(
      { error: "Failed to raise dispute" },
      { status: 500 },
    );
  }
}
