import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { memoize } from "@/lib/cache";

export const dynamic = "force-dynamic";

interface HomeStats {
  totalJobs: number;
  totalLocked: number;
  completed: number;
  successRate: number;
  activeUsers: number;
  totalTxFees: number;
}

// C-115: cache the home-page stats. The home page polls this endpoint; without a
// cache every visitor's poll runs 5 COUNT/scan queries. A short TTL collapses all
// concurrent polls into one query set per window, cutting DB transfer cost.
const STATS_TTL_MS = Number(process.env.STATS_CACHE_TTL_MS ?? 30_000);

export async function GET() {
  try {
    const data = await memoize<HomeStats>("stats:home", STATS_TTL_MS, async () => {
      const totalJobs = await prisma.job.count();

      const lockedJobs = await prisma.job.findMany({
        where: { status: { in: ["Open", "Accepted"] } },
        select: { amount: true },
      });
      const totalLocked = lockedJobs.reduce((sum, job) => sum + job.amount, 0);

      const completed = await prisma.job.count({ where: { status: "Completed" } });
      const successRate = totalJobs > 0 ? (completed / totalJobs) * 100 : 0;

      const activeUsers = await prisma.profile.count();

      const totalTransactions = await prisma.transaction.count();
      const totalTxFees = totalTransactions * 0.000005; // Average Solana fee

      return {
        totalJobs,
        totalLocked,
        completed,
        successRate: Math.round(successRate * 10) / 10,
        activeUsers,
        totalTxFees,
      };
    });

    return NextResponse.json(data);
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
