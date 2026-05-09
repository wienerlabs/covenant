import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const totalJobs = await prisma.job.count();

    const lockedJobs = await prisma.job.findMany({
      where: {
        status: { in: ["Open", "Accepted"] },
      },
      select: { amount: true },
    });

    const totalLocked = lockedJobs.reduce((sum, job) => sum + job.amount, 0);

    const completed = await prisma.job.count({
      where: { status: "Completed" },
    });

    const successRate = totalJobs > 0 ? (completed / totalJobs) * 100 : 0;

    const activeUsers = await prisma.profile.count();

    const totalTransactions = await prisma.transaction.count();
    const totalTxFees = totalTransactions * 0.000005; // Average Solana fee

    return NextResponse.json({
      totalJobs,
      totalLocked,
      completed,
      successRate: Math.round(successRate * 10) / 10,
      activeUsers,
      totalTxFees,
    });
  } catch (error) {
    console.error("GET /api/stats error:", error);
    return NextResponse.json(
      {
        totalJobs: 0,
        totalLocked: 0,
        completed: 0,
        successRate: 0,
        activeUsers: 0,
        totalTxFees: 0,
        dbHealthy: false,
        error: error instanceof Error ? error.message : "Failed to fetch stats",
      },
      { status: 200 },
    );
  }
}
