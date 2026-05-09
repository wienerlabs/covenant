import { NextResponse } from "next/server";
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

interface SettlementStats {
  bucketCounts: BucketCounts;
  totalSettledUsdc: number;
  totalEscrowLockedUsdc: number;
  autoReleaseRate: number;
  disputeRate: number;
  avgSettlementSeconds: number;
  inChallengeNow: number;
  inChallengeJobs: InChallengeJob[];
  recentSettlements: RecentSettlement[];
}

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

export async function GET(): Promise<NextResponse<SettlementStats>> {
  try {
    const data = await memoize<SettlementStats>("settlement:stats:v1", 5_000, async () =>
      retryable(async () => {
        const [grouped, inChallenge, recent, settledAgg, lockedAgg, deliveredFinalized] =
          await Promise.all([
            prisma.job.groupBy({
              by: ["status"],
              _count: { _all: true },
            }),
            prisma.job.findMany({
              where: {
                status: "Delivered",
                challengeEndAt: { gt: new Date() },
              },
              orderBy: { challengeEndAt: "asc" },
              take: 12,
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
              where: {
                status: { in: ["Finalized", "Resolved"] },
              },
              orderBy: { updatedAt: "desc" },
              take: 10,
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
              where: {
                status: "Finalized",
                deliveredAt: { not: null },
              },
              orderBy: { updatedAt: "desc" },
              take: 200,
              select: { deliveredAt: true, updatedAt: true },
            }),
          ]);

        const buckets = emptyBuckets();
        for (const row of grouped) {
          const key = row.status as keyof BucketCounts;
          if (STATUS_KEYS.includes(key)) {
            buckets[key] = row._count._all;
          }
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

        return {
          bucketCounts: buckets,
          totalSettledUsdc: settledAgg._sum.amount ?? 0,
          totalEscrowLockedUsdc: lockedAgg._sum.amount ?? 0,
          autoReleaseRate,
          disputeRate,
          avgSettlementSeconds,
          inChallengeNow: inChallenge.length,
          inChallengeJobs,
          recentSettlements,
        };
      }),
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/settlement/stats error:", error);
    return NextResponse.json(
      {
        bucketCounts: emptyBuckets(),
        totalSettledUsdc: 0,
        totalEscrowLockedUsdc: 0,
        autoReleaseRate: 0,
        disputeRate: 0,
        avgSettlementSeconds: 0,
        inChallengeNow: 0,
        inChallengeJobs: [],
        recentSettlements: [],
      },
      { status: 200 },
    );
  }
}
