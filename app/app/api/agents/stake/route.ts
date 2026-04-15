import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/agents/stake
 * Record a USDC stake for an agent wallet.
 *
 * Body: { walletAddress, amount }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress, amount } = body as {
      walletAddress?: string;
      amount?: number;
    };

    if (!walletAddress || typeof walletAddress !== "string") {
      return NextResponse.json(
        { error: "walletAddress is required" },
        { status: 400 },
      );
    }

    if (typeof amount !== "number" || amount < 10) {
      return NextResponse.json(
        { error: "Minimum stake is 10 USDC" },
        { status: 400 },
      );
    }

    const stake = await prisma.agentStake.upsert({
      where: { walletAddress },
      create: {
        walletAddress,
        amount,
        status: "active",
      },
      update: {
        amount: { increment: amount },
        status: "active",
      },
    });

    return NextResponse.json(stake);
  } catch (error) {
    console.error("POST /api/agents/stake error:", error);
    return NextResponse.json(
      { error: "Failed to record stake" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/agents/stake?wallet=xxx
 * Get stake info for a wallet.
 */
export async function GET(req: NextRequest) {
  try {
    const wallet = req.nextUrl.searchParams.get("wallet");

    if (!wallet) {
      return NextResponse.json(
        { error: "wallet query param required" },
        { status: 400 },
      );
    }

    const stake = await prisma.agentStake.findUnique({
      where: { walletAddress: wallet },
    });

    if (!stake) {
      return NextResponse.json({ amount: 0, status: "none" });
    }

    return NextResponse.json(stake);
  } catch (error) {
    console.error("GET /api/agents/stake error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stake" },
      { status: 500 },
    );
  }
}
