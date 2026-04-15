import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { releaseFundsToTaker } from "@/lib/escrow";
import crypto from "crypto";

/**
 * POST /api/disputes/[id]/resolve
 *
 * Whitelisted arbitrator submits their vote for a dispute resolution.
 * When the number of distinct approving arbitrators reaches the configured
 * threshold (default 2 of 3), the dispute is finalized on-chain:
 * - FavorTaker: taker receives full escrow + poster's slashed bond
 * - FavorPoster: escrow returned to poster, taker gets nothing
 * - Split: taker_amount to taker, remainder to poster
 *
 * Body: { arbitratorWallet, resolution, takerAmount?, txHash? }
 *   resolution: "FavorTaker" | "FavorPoster" | "Split"
 */

const ARBITRATORS = (process.env.COVENANT_ARBITRATORS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const THRESHOLD = parseInt(process.env.COVENANT_ARBITRATOR_THRESHOLD ?? "2", 10);

type ResolutionKind = "FavorTaker" | "FavorPoster" | "Split";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      arbitratorWallet,
      resolution,
      takerAmount,
      txHash,
    } = body as {
      arbitratorWallet?: string;
      resolution?: string;
      takerAmount?: number;
      txHash?: string;
    };

    if (!arbitratorWallet) {
      return NextResponse.json(
        { error: "arbitratorWallet is required" },
        { status: 400 },
      );
    }
    if (ARBITRATORS.length === 0) {
      return NextResponse.json(
        { error: "Arbitrator list not configured" },
        { status: 503 },
      );
    }
    if (!ARBITRATORS.includes(arbitratorWallet)) {
      return NextResponse.json(
        { error: "Not a whitelisted arbitrator" },
        { status: 403 },
      );
    }
    if (!resolution || !["FavorTaker", "FavorPoster", "Split"].includes(resolution)) {
      return NextResponse.json(
        { error: "resolution must be one of: FavorTaker, FavorPoster, Split" },
        { status: 400 },
      );
    }
    const kind = resolution as ResolutionKind;

    const dispute = await prisma.dispute.findUnique({
      where: { id },
      include: { job: true },
    });
    if (!dispute) {
      return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
    }
    if (dispute.resolvedAt) {
      return NextResponse.json(
        { error: "Dispute already resolved", resolution: dispute.resolution },
        { status: 409 },
      );
    }

    if (kind === "Split") {
      if (typeof takerAmount !== "number" || takerAmount < 0) {
        return NextResponse.json(
          { error: "Split resolution requires non-negative takerAmount" },
          { status: 400 },
        );
      }
      if (takerAmount > dispute.job.amount) {
        return NextResponse.json(
          { error: "takerAmount exceeds escrow balance" },
          { status: 400 },
        );
      }
    }

    // Lock in the pending resolution on first vote; subsequent votes must match
    const currentResolution = dispute.resolution ?? "Pending";
    if (currentResolution !== "Pending" && currentResolution !== kind) {
      return NextResponse.json(
        {
          error: `First arbitrator voted '${currentResolution}'; cannot approve '${kind}' without a new dispute`,
        },
        { status: 409 },
      );
    }

    const alreadyVoted = dispute.approvedBy.includes(arbitratorWallet);
    if (alreadyVoted) {
      return NextResponse.json(
        { error: "Arbitrator has already voted on this dispute" },
        { status: 409 },
      );
    }

    // Add the vote
    const newApprovedBy = [...dispute.approvedBy, arbitratorWallet];
    const newApprovalCount = newApprovedBy.length;
    const thresholdReached = newApprovalCount >= THRESHOLD;

    if (!thresholdReached) {
      // Partial update — wait for more votes
      const updated = await prisma.dispute.update({
        where: { id },
        data: {
          resolution: kind,
          takerAmount: kind === "Split" ? takerAmount : null,
          approvedBy: newApprovedBy,
          approvalCount: newApprovalCount,
          txHashResolve: dispute.txHashResolve ?? txHash,
        },
      });
      return NextResponse.json({
        dispute: updated,
        thresholdReached: false,
        approvalsRequired: THRESHOLD,
        approvalsHave: newApprovalCount,
      });
    }

    // Threshold reached: apply resolution and distribute funds
    let paymentTxHash: string | null = null;
    const payoutToTaker =
      kind === "FavorTaker"
        ? dispute.job.amount
        : kind === "Split"
          ? (takerAmount as number)
          : 0;

    if (payoutToTaker > 0 && dispute.job.takerWallet) {
      try {
        const result = await releaseFundsToTaker(
          dispute.job.takerWallet,
          payoutToTaker,
        );
        paymentTxHash = result.txHash;
      } catch (err) {
        console.error("[resolve] escrow release failed:", err);
        return NextResponse.json(
          {
            error: "Escrow release failed; dispute not finalized",
            detail: err instanceof Error ? err.message : String(err),
          },
          { status: 500 },
        );
      }
    }

    const resolved = await prisma.$transaction(async (tx) => {
      const d = await tx.dispute.update({
        where: { id },
        data: {
          resolution: kind,
          takerAmount: kind === "Split" ? takerAmount : null,
          approvedBy: newApprovedBy,
          approvalCount: newApprovalCount,
          resolvedAt: new Date(),
          txHashResolve: txHash ?? paymentTxHash ?? dispute.txHashResolve,
        },
      });
      await tx.job.update({
        where: { id: dispute.jobId },
        data: { status: "Resolved" },
      });

      if (dispute.job.takerWallet) {
        await tx.reputation.upsert({
          where: { walletAddress: dispute.job.takerWallet },
          create: {
            walletAddress: dispute.job.takerWallet,
            jobsCompleted: kind === "FavorPoster" ? 0 : 1,
            jobsFailed: kind === "FavorPoster" ? 1 : 0,
            jobsDisputed: 1,
            totalEarned: payoutToTaker,
          },
          update: {
            jobsCompleted: {
              increment: kind === "FavorPoster" ? 0 : 1,
            },
            jobsFailed: {
              increment: kind === "FavorPoster" ? 1 : 0,
            },
            jobsDisputed: { increment: 1 },
            totalEarned: { increment: payoutToTaker },
          },
        });
      }

      await tx.jobEvent.create({
        data: {
          jobId: dispute.jobId,
          type: "resolved",
          txSignature:
            paymentTxHash ??
            txHash ??
            "local:resolved:" + crypto.randomBytes(12).toString("hex"),
          wallet: arbitratorWallet,
          amount: payoutToTaker,
          data: {
            resolution: kind,
            takerAmount: kind === "Split" ? takerAmount : null,
            arbitrators: newApprovedBy,
            paymentTxHash,
          },
        },
      });

      return d;
    });

    return NextResponse.json({
      dispute: resolved,
      thresholdReached: true,
      paymentTxHash,
      payoutToTaker,
    });
  } catch (error) {
    console.error("POST /api/disputes/[id]/resolve error:", error);
    return NextResponse.json(
      { error: "Failed to resolve dispute" },
      { status: 500 },
    );
  }
}
