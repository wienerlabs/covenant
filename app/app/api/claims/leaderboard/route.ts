import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/claims/leaderboard
 *
 * Top lenders ranked by total claims bought (optionally filtered to a
 * rolling window). Used by the /credit LeaderboardWidget.
 *
 * Query params:
 *   limit  — default 5, max 25
 *   window — "all" | "7d" | "30d" (default "all")
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.max(
      1,
      Math.min(25, parseInt(searchParams.get("limit") ?? "5", 10)),
    );
    const window = searchParams.get("window") ?? "all";

    const since =
      window === "7d"
        ? new Date(Date.now() - 7 * 24 * 3600_000)
        : window === "30d"
          ? new Date(Date.now() - 30 * 24 * 3600_000)
          : null;

    const whereBought: Record<string, unknown> = {
      buyerWallet: { not: null },
      status: { in: ["Bought", "Settled"] },
    };
    if (since) whereBought.boughtAt = { gte: since };

    // Fetch the bought claims and aggregate in memory — Postgres aggregate
    // via Prisma groupBy is awkward with string/float fields, and the
    // volumes are tiny for a hackathon demo.
    const bought = await prisma.claimListing.findMany({
      where: whereBought,
      select: {
        buyerWallet: true,
        price: true,
        faceValue: true,
        status: true,
      },
    });

    const tally = new Map<
      string,
      { count: number; spent: number; faceValue: number; settled: number }
    >();
    for (const c of bought) {
      if (!c.buyerWallet) continue;
      const t = tally.get(c.buyerWallet) ?? {
        count: 0,
        spent: 0,
        faceValue: 0,
        settled: 0,
      };
      t.count += 1;
      t.spent += c.price;
      t.faceValue += c.faceValue;
      if (c.status === "Settled") t.settled += 1;
      tally.set(c.buyerWallet, t);
    }

    const leaders = [...tally.entries()]
      .map(([wallet, t]) => ({
        wallet,
        claimsBought: t.count,
        usdcSpent: Number(t.spent.toFixed(2)),
        usdcFaceValue: Number(t.faceValue.toFixed(2)),
        grossYield: Number((t.faceValue - t.spent).toFixed(2)),
        settledCount: t.settled,
      }))
      .sort((a, b) => b.claimsBought - a.claimsBought || b.grossYield - a.grossYield)
      .slice(0, limit);

    return NextResponse.json({
      window,
      leaders,
      totals: {
        distinctLenders: tally.size,
      },
    });
  } catch (error) {
    console.error("GET /api/claims/leaderboard error:", error);
    return NextResponse.json(
      { error: "Failed to fetch leaderboard" },
      { status: 500 },
    );
  }
}
