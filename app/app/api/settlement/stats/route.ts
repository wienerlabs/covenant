import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma, retryable } from "@/lib/prisma";
import { memoize } from "@/lib/cache";

export const dynamic = "force-dynamic";

interface BucketCounts {
  Open: number;
  Accepted: number;
  Delivered: number;
  Finalized: number;
  Disputed: number;
  Resolved: number;
  Cancelled: number;
}

interface InChallengeJob {
  id: string;
  pda: string | null;
  amount: number;
  paymentToken: string;
  category: string;
  posterWallet: string;
  takerWallet: string | null;
  challengeEndAt: string | null;
  deliveredAt: string | null;
  txHash: string | null;
  title: string | null;
}

interface RecentSettlement {
  id: string;
  pda: string | null;
  amount: number;
  paymentToken: string;
  category: string;
  status: string;
  finalizedAt: string;
  txHash: string | null;
  outcome: "auto_release" | "resolved";
}

interface VolumePoint {
  date: string; // ISO day
  usdc: number;
  count: number;
}

interface CategoryStat {
  category: string;
  settledCount: number;
  settledUsdc: number;
  lockedUsdc: number;
}

interface HeatCell {
  dow: number; // 0-6, 0 = Sunday
  hour: number; // 0-23
  count: number;
}

interface TopEarner {
  wallet: string;
  earnedUsdc: number;
  jobsCompleted: number;
}

interface NetworkEdge {
  poster: string;
  taker: string;
  amount: number;
  category: string;
}

interface SettlementStats {
  bucketCounts: BucketCounts;
  totalSettledUsdc: number;
  totalEscrowLockedUsdc: number;
  autoReleaseRate: number;
  disputeRate: number;
  avgSettlementSeconds: number;
  protocolFeeUsdc: number;
  inChallengeNow: number;
  inChallengeJobs: InChallengeJob[];
  recentSettlements: RecentSettlement[];
  volumeSeries: VolumePoint[];
  categoryBreakdown: CategoryStat[];
  heatmap: HeatCell[];
  topEarners: TopEarner[];
  networkEdges: NetworkEdge[];
}

const PROTOCOL_FEE_BPS = 20; // 0.20%

const STATUS_KEYS: (keyof BucketCounts)[] = [
  "Open",
  "Accepted",
  "Delivered",
  "Finalized",
  "Disputed",
  "Resolved",
  "Cancelled",
];

function emptyBuckets(): BucketCounts {
  return {
    Open: 0,
    Accepted: 0,
    Delivered: 0,
    Finalized: 0,
    Disputed: 0,
    Resolved: 0,
    Cancelled: 0,
  };
}

function specTitle(spec: unknown): string | null {
  if (!spec || typeof spec !== "object") return null;
  const t = (spec as Record<string, unknown>).title;
  return typeof t === "string" ? t : null;
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string") return Number(v);
  return 0;
}

function emptyStats(): SettlementStats {
  return {
    bucketCounts: emptyBuckets(),
    totalSettledUsdc: 0,
    totalEscrowLockedUsdc: 0,
    autoReleaseRate: 0,
    disputeRate: 0,
    avgSettlementSeconds: 0,
    protocolFeeUsdc: 0,
    inChallengeNow: 0,
    inChallengeJobs: [],
    recentSettlements: [],
    volumeSeries: [],
    categoryBreakdown: [],
    heatmap: [],
    topEarners: [],
    networkEdges: [],
  };
}

export async function GET(): Promise<NextResponse<SettlementStats>> {
  try {
    const data = await memoize<SettlementStats>(
      "settlement:overview:v2",
      5_000,
      async () =>
        retryable(async () => {
          const [
            grouped,
            inChallenge,
            recent,
            settledAgg,
            lockedAgg,
            deliveredFinalized,
            volumeRows,
            categoryRows,
            heatRows,
            earners,
            edges,
          ] = await Promise.all([
            prisma.job.groupBy({ by: ["status"], _count: { _all: true } }),
            prisma.job.findMany({
              where: { status: "Delivered", challengeEndAt: { gt: new Date() } },
              orderBy: { challengeEndAt: "asc" },
              take: 14,
              select: {
                id: true,
                pda: true,
                amount: true,
                paymentToken: true,
                category: true,
                posterWallet: true,
                takerWallet: true,
                challengeEndAt: true,
                deliveredAt: true,
                txHash: true,
                specJson: true,
              },
            }),
            prisma.job.findMany({
              where: { status: { in: ["Finalized", "Resolved"] } },
              orderBy: { updatedAt: "desc" },
              take: 12,
              select: {
                id: true,
                pda: true,
                amount: true,
                paymentToken: true,
                category: true,
                status: true,
                updatedAt: true,
                txHash: true,
              },
            }),
            prisma.job.aggregate({
              where: {
                status: { in: ["Finalized", "Resolved"] },
                paymentToken: "USDC",
              },
              _sum: { amount: true },
            }),
            prisma.job.aggregate({
              where: {
                status: { in: ["Open", "Accepted", "Delivered"] },
                paymentToken: "USDC",
              },
              _sum: { amount: true },
            }),
            prisma.job.findMany({
              where: { status: "Finalized", deliveredAt: { not: null } },
              orderBy: { updatedAt: "desc" },
              take: 200,
              select: { deliveredAt: true, updatedAt: true },
            }),
            // Volume series: settled USDC per day, last 14 days.
            prisma.$queryRaw<{ day: Date; usdc: number; cnt: bigint }[]>(
              Prisma.sql`
                SELECT date_trunc('day', "updatedAt") AS day,
                       coalesce(sum(amount), 0) AS usdc,
                       count(*) AS cnt
                FROM "Job"
                WHERE status IN ('Finalized','Resolved')
                  AND "paymentToken" = 'USDC'
                  AND "updatedAt" > now() - interval '14 days'
                GROUP BY day
                ORDER BY day ASC
              `,
            ),
            // Category breakdown: settled + locked per category.
            prisma.$queryRaw<
              {
                category: string;
                settled_count: bigint;
                settled_usdc: number;
                locked_usdc: number;
              }[]
            >(
              Prisma.sql`
                SELECT category,
                  count(*) FILTER (WHERE status IN ('Finalized','Resolved')) AS settled_count,
                  coalesce(sum(amount) FILTER (WHERE status IN ('Finalized','Resolved') AND "paymentToken"='USDC'), 0) AS settled_usdc,
                  coalesce(sum(amount) FILTER (WHERE status IN ('Open','Accepted','Delivered') AND "paymentToken"='USDC'), 0) AS locked_usdc
                FROM "Job"
                GROUP BY category
                ORDER BY settled_usdc DESC
              `,
            ),
            // Heatmap: settlements by day-of-week x hour, last 30 days.
            prisma.$queryRaw<{ dow: number; hour: number; cnt: bigint }[]>(
              Prisma.sql`
                SELECT extract(dow from "updatedAt")::int AS dow,
                       extract(hour from "updatedAt")::int AS hour,
                       count(*) AS cnt
                FROM "Job"
                WHERE status IN ('Finalized','Resolved')
                  AND "updatedAt" > now() - interval '30 days'
                GROUP BY dow, hour
              `,
            ),
            // Top earners by reputation.
            prisma.reputation.findMany({
              orderBy: { totalEarned: "desc" },
              take: 8,
              select: {
                walletAddress: true,
                totalEarned: true,
                jobsCompleted: true,
              },
            }),
            // Network edges: recent settlements poster -> taker.
            prisma.job.findMany({
              where: {
                status: { in: ["Finalized", "Resolved"] },
                takerWallet: { not: null },
                paymentToken: "USDC",
              },
              orderBy: { updatedAt: "desc" },
              take: 50,
              select: {
                posterWallet: true,
                takerWallet: true,
                amount: true,
                category: true,
              },
            }),
          ]);

          const buckets = emptyBuckets();
          for (const row of grouped) {
            const key = row.status as keyof BucketCounts;
            if (STATUS_KEYS.includes(key)) buckets[key] = row._count._all;
          }

          const finalized = buckets.Finalized;
          const resolved = buckets.Resolved;
          const disputed = buckets.Disputed;
          const settledTotal = finalized + resolved;
          const autoReleaseRate =
            settledTotal + disputed > 0
              ? finalized / (settledTotal + disputed)
              : 0;
          const disputeRate =
            settledTotal + disputed > 0
              ? (disputed + resolved) / (settledTotal + disputed)
              : 0;

          let avgSettlementSeconds = 0;
          if (deliveredFinalized.length > 0) {
            const total = deliveredFinalized.reduce((acc, job) => {
              if (!job.deliveredAt) return acc;
              const delta =
                (job.updatedAt.getTime() - job.deliveredAt.getTime()) / 1000;
              return acc + Math.max(0, delta);
            }, 0);
            avgSettlementSeconds = Math.round(total / deliveredFinalized.length);
          }

          const totalSettledUsdc = settledAgg._sum.amount ?? 0;

          const inChallengeJobs: InChallengeJob[] = inChallenge.map((job) => ({
            id: job.id,
            pda: job.pda,
            amount: job.amount,
            paymentToken: job.paymentToken,
            category: job.category,
            posterWallet: job.posterWallet,
            takerWallet: job.takerWallet,
            challengeEndAt: job.challengeEndAt
              ? job.challengeEndAt.toISOString()
              : null,
            deliveredAt: job.deliveredAt ? job.deliveredAt.toISOString() : null,
            txHash: job.txHash,
            title: specTitle(job.specJson),
          }));

          const recentSettlements: RecentSettlement[] = recent.map((job) => ({
            id: job.id,
            pda: job.pda,
            amount: job.amount,
            paymentToken: job.paymentToken,
            category: job.category,
            status: job.status,
            finalizedAt: job.updatedAt.toISOString(),
            txHash: job.txHash,
            outcome: job.status === "Finalized" ? "auto_release" : "resolved",
          }));

          const volumeSeries: VolumePoint[] = volumeRows.map((r) => ({
            date: new Date(r.day).toISOString(),
            usdc: num(r.usdc),
            count: num(r.cnt),
          }));

          const categoryBreakdown: CategoryStat[] = categoryRows.map((r) => ({
            category: r.category,
            settledCount: num(r.settled_count),
            settledUsdc: num(r.settled_usdc),
            lockedUsdc: num(r.locked_usdc),
          }));

          const heatmap: HeatCell[] = heatRows.map((r) => ({
            dow: num(r.dow),
            hour: num(r.hour),
            count: num(r.cnt),
          }));

          const topEarners: TopEarner[] = earners
            .filter((e) => e.totalEarned > 0)
            .map((e) => ({
              wallet: e.walletAddress,
              earnedUsdc: e.totalEarned,
              jobsCompleted: e.jobsCompleted,
            }));

          const networkEdges: NetworkEdge[] = edges
            .filter((e) => e.takerWallet)
            .map((e) => ({
              poster: e.posterWallet,
              taker: e.takerWallet as string,
              amount: e.amount,
              category: e.category,
            }));

          return {
            bucketCounts: buckets,
            totalSettledUsdc,
            totalEscrowLockedUsdc: lockedAgg._sum.amount ?? 0,
            autoReleaseRate,
            disputeRate,
            avgSettlementSeconds,
            protocolFeeUsdc: (totalSettledUsdc * PROTOCOL_FEE_BPS) / 10_000,
            inChallengeNow: inChallenge.length,
            inChallengeJobs,
            recentSettlements,
            volumeSeries,
            categoryBreakdown,
            heatmap,
            topEarners,
            networkEdges,
          };
        }),
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/settlement/stats error:", error);
    return NextResponse.json(emptyStats(), { status: 200 });
  }
}
