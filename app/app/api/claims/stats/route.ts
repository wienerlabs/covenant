import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/claims/stats
 *
 * Aggregate time-series stats for the /credit/dashboard visualizer.
 * Buckets claims by hour over the last 7 days and exposes four
 * rolling series:
 *   - tvl[]        — active-listing face value per hour
 *   - boughtCount[] — purchases closed per hour
 *   - settledCount[] — finalizations routed to buyers per hour
 *   - avgApr[]      — average APR of listings active in that bucket
 *
 * Plus point-in-time totals used by the hero strip.
 */
export async function GET() {
  try {
    const now = Date.now();
    const HOUR = 3600_000;
    const BUCKETS = 24 * 7;
    const start = now - BUCKETS * HOUR;

    // Point-in-time totals (fast).
    const [listed, bought, settled, cancelled] = await Promise.all([
      prisma.claimListing.findMany({
        where: { status: "Listed" },
        include: { job: { select: { challengeEndAt: true, amount: true } } },
      }),
      prisma.claimListing.count({ where: { status: "Bought" } }),
      prisma.claimListing.count({ where: { status: "Settled" } }),
      prisma.claimListing.count({ where: { status: "Cancelled" } }),
    ]);

    const activeTvl = listed.reduce((sum, c) => sum + c.faceValue, 0);

    // Compute current APR distribution.
    const aprs: number[] = [];
    for (const c of listed) {
      if (!c.job.challengeEndAt) continue;
      const secondsLeft = Math.max(
        1,
        Math.round((c.job.challengeEndAt.getTime() - now) / 1000),
      );
      const years = secondsLeft / (365 * 24 * 3600);
      const apr = ((c.faceValue / c.price) - 1) / years;
      if (isFinite(apr)) aprs.push(Math.min(9999, apr * 100));
    }
    aprs.sort((a, b) => a - b);
    const aprMedian = aprs.length > 0 ? aprs[Math.floor(aprs.length / 2)] : 0;
    const aprP90 =
      aprs.length > 0 ? aprs[Math.min(aprs.length - 1, Math.floor(aprs.length * 0.9))] : 0;

    // Bucket historical events by hour for sparklines.
    const rows = await prisma.claimListing.findMany({
      where: {
        OR: [
          { listedAt: { gte: new Date(start) } },
          { boughtAt: { gte: new Date(start) } },
          { settledAt: { gte: new Date(start) } },
        ],
      },
      select: {
        listedAt: true,
        boughtAt: true,
        settledAt: true,
        faceValue: true,
        price: true,
      },
    });

    const tvl = new Array<number>(BUCKETS).fill(0);
    const boughtSeries = new Array<number>(BUCKETS).fill(0);
    const settledSeries = new Array<number>(BUCKETS).fill(0);
    const volumeSeries = new Array<number>(BUCKETS).fill(0);

    for (const r of rows) {
      if (r.listedAt) {
        const b = Math.floor((r.listedAt.getTime() - start) / HOUR);
        if (b >= 0 && b < BUCKETS) tvl[b] += r.faceValue;
      }
      if (r.boughtAt) {
        const b = Math.floor((r.boughtAt.getTime() - start) / HOUR);
        if (b >= 0 && b < BUCKETS) {
          boughtSeries[b] += 1;
          volumeSeries[b] += r.price;
        }
      }
      if (r.settledAt) {
        const b = Math.floor((r.settledAt.getTime() - start) / HOUR);
        if (b >= 0 && b < BUCKETS) settledSeries[b] += 1;
      }
    }

    // Cumulative TVL (listings are created, then eventually removed; we
    // approximate with running sum of listed face values bucketed at list
    // time — imperfect but fine for a hackathon demo sparkline).
    const tvlCumulative: number[] = [];
    let running = 0;
    for (const v of tvl) {
      running += v;
      tvlCumulative.push(running);
    }

    return NextResponse.json({
      now,
      bucketHours: BUCKETS,
      totals: {
        activeListings: listed.length,
        activeTvl,
        boughtCount: bought,
        settledCount: settled,
        cancelledCount: cancelled,
      },
      apr: {
        median: aprMedian,
        p90: aprP90,
        distribution: aprs,
      },
      series: {
        tvlCumulative,
        boughtPerHour: boughtSeries,
        settledPerHour: settledSeries,
        volumePerHour: volumeSeries,
      },
    });
  } catch (error) {
    console.error("GET /api/claims/stats error:", error);
    return NextResponse.json(
      { error: "Failed to compute claim stats" },
      { status: 500 },
    );
  }
}
