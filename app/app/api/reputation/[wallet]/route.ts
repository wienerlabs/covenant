import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ wallet: string }> }
) {
  try {
    const { wallet } = await params;

    const reputation = await prisma.reputation.findUnique({
      where: { walletAddress: wallet },
    });

    if (!reputation) {
      return NextResponse.json({
        walletAddress: wallet,
        jobsCompleted: 0,
        jobsFailed: 0,
        totalEarned: 0,
        firstJobAt: null,
      });
    }

    return NextResponse.json(reputation);
  } catch (error) {
    console.error("GET /api/reputation/[wallet] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch reputation" },
      { status: 500 }
    );
  }
}
