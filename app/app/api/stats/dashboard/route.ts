import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json(
      { error: "Missing ?wallet= query param" },
      { status: 400 },
    );
  }

  try {
    // ── 1. Daily jobs (last 7 days) ──────────────────────────────────
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const recentJobs = await prisma.job.findMany({
      where: {
        OR: [
          { posterWallet: wallet },
          { takerWallet: wallet },
        ],
        createdAt: { gte: sevenDaysAgo },
      },
      select: { createdAt: true },
    });

    // Build a map of the last 7 calendar days
    const dailyMap = new Map<string, number>();
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
      dailyMap.set(key, 0);
    }
    for (const j of recentJobs) {
      const key = new Date(j.createdAt).toISOString().slice(0, 10);
      if (dailyMap.has(key)) {
        dailyMap.set(key, (dailyMap.get(key) ?? 0) + 1);
      }
    }
    const dailyJobs = Array.from(dailyMap.entries()).map(([date, count]) => ({
      date,
      count,
    }));

    // ── 2. Earnings trend (last 10 finalized jobs) ───────────────────
    const finalizedJobs = await prisma.job.findMany({
      where: {
        takerWallet: wallet,
        status: { in: ["Finalized", "Completed", "Resolved"] },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { amount: true, updatedAt: true },
    });

    // Reverse so oldest is first (left-to-right chronological)
    const earningsTrend = finalizedJobs.reverse().map((j, i) => ({
      label: `Job ${i + 1}`,
      amount: j.amount,
    }));

    // ── 3. Category distribution ─────────────────────────────────────
    const allUserJobs = await prisma.job.findMany({
      where: {
        OR: [
          { posterWallet: wallet },
          { takerWallet: wallet },
        ],
      },
      select: { category: true },
    });

    const catMap = new Map<string, number>();
    for (const j of allUserJobs) {
      const cat = j.category || "text_writing";
      catMap.set(cat, (catMap.get(cat) ?? 0) + 1);
    }
    const totalCatJobs = allUserJobs.length || 1;
    const categoryDistribution = Array.from(catMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => ({
        category,
        count,
        percentage: Math.round((count / totalCatJobs) * 1000) / 10,
      }));

    return NextResponse.json({ dailyJobs, earningsTrend, categoryDistribution });
  } catch (error) {
    console.error("GET /api/stats/dashboard error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard stats" },
      { status: 500 },
    );
  }
}
