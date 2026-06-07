import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enforceIpLimit } from "@/lib/rateLimit";

/**
 * POST /api/agents/unstake
 * Request unstake for an agent wallet.
 *
 * Body: { walletAddress }
 *
 * Rules:
 * - Agent must have an active stake
 * - No active jobs in progress
 * - Perfect record (jobsCompleted > 0, jobsFailed == 0) → 5% bonus
 * - Any disputes lost → slash 20% of stake
 */
export async function POST(req: NextRequest) {
  try {
    const limited = await enforceIpLimit(req, "unstake");
    if (limited) return limited;

    const body = await req.json();
    const { walletAddress } = body as { walletAddress?: string };

    if (!walletAddress || typeof walletAddress !== "string") {
      return NextResponse.json(
        { error: "walletAddress is required" },
        { status: 400 },
      );
    }

    // Check active stake
    const stake = await prisma.agentStake.findUnique({
      where: { walletAddress },
    });

    if (!stake || stake.status !== "active") {
      return NextResponse.json(
        { error: "No active stake found" },
        { status: 400 },
      );
    }

    // Check no active jobs in progress
    const activeJobs = await prisma.job.count({
      where: {
        takerWallet: walletAddress,
        status: { in: ["Accepted", "Delivered"] },
      },
    });

    if (activeJobs > 0) {
      return NextResponse.json(
        { error: "Cannot unstake while jobs are in progress" },
        { status: 409 },
      );
    }

    // Get reputation
    const reputation = await prisma.reputation.findUnique({
      where: { walletAddress },
    });

    let bonus = 0;
    let slashed = 0;
    let amountReturned = stake.amount;
    let newStatus = "returned";

    // Check for disputes lost (resolved in favor of poster)
    const disputesLost = await prisma.dispute.count({
      where: {
        job: { takerWallet: walletAddress },
        resolution: "FavorPoster",
      },
    });

    if (disputesLost > 0) {
      // Slash 20%
      slashed = stake.amount * 0.2;
      amountReturned = stake.amount - slashed;
      newStatus = "slashed";
    } else if (
      reputation &&
      reputation.jobsCompleted > 0 &&
      reputation.jobsFailed === 0
    ) {
      // 5% bonus for perfect record
      bonus = stake.amount * 0.05;
      amountReturned = stake.amount + bonus;
    }

    // Update stake record
    await prisma.agentStake.update({
      where: { walletAddress },
      data: {
        status: newStatus,
        slashedAmount: slashed,
        bonusEarned: bonus,
      },
    });

    return NextResponse.json({
      amountReturned,
      bonus,
      slashed,
      originalStake: stake.amount,
      status: newStatus,
    });
  } catch (error) {
    console.error("POST /api/agents/unstake error:", error);
    return NextResponse.json(
      { error: "Failed to process unstake" },
      { status: 500 },
    );
  }
}
