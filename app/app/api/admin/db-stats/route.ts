import { NextRequest } from "next/server";
import { prisma, retryable } from "@/lib/prisma";
import { ok, fail } from "@/lib/api-response";
import { log } from "@/lib/logger";
import { memoizeStats } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/db-stats
 *
 * Operator-facing snapshot of database state. Returns:
 *   - per-table row counts for the 12 tables that matter most
 *   - status breakdown for jobs (Open / Accepted / Delivered / ...)
 *   - aggregate USDC volume locked + paid out
 *   - claim listing market totals
 *   - cache hit/miss stats from the in-memory LRU
 *   - DB connection metadata (server version, current tx)
 *
 * Auth: Bearer ADMIN_SECRET. No rate limit — operator endpoint
 * meant to be hit by dashboards / monitors / on-call scripts.
 */
function authorized(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET || process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

interface DbStats {
  collected_at: string;
  duration_ms: number;
  cluster: string;
  postgres_version?: string;
  tables: Record<string, number>;
  jobs: {
    by_status: Record<string, number>;
    total_amount_usdc: number;
    avg_amount_usdc: number;
    completed_in_last_24h: number;
    open_now: number;
  };
  claims: {
    by_status: Record<string, number>;
    active_tvl_usdc: number;
  };
  arena: {
    total_battles: number;
    last_battle_at: string | null;
  };
  cache: ReturnType<typeof memoizeStats>;
  errors: string[];
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return fail("unauthorized", "Bearer admin secret required.");

  const reqLog = log.forRequest(req);
  const startedAt = Date.now();
  const errors: string[] = [];

  const result: DbStats = {
    collected_at: new Date().toISOString(),
    duration_ms: 0,
    cluster: "devnet",
    tables: {},
    jobs: {
      by_status: {},
      total_amount_usdc: 0,
      avg_amount_usdc: 0,
      completed_in_last_24h: 0,
      open_now: 0,
    },
    claims: {
      by_status: {},
      active_tvl_usdc: 0,
    },
    arena: {
      total_battles: 0,
      last_battle_at: null,
    },
    cache: memoizeStats(),
    errors,
  };

  // ---- Server version (also confirms reachability) ----
  try {
    const v = await retryable(
      () => prisma.$queryRaw<Array<{ version: string }>>`SELECT version() as version`,
    );
    result.postgres_version = v[0]?.version ?? undefined;
  } catch (err) {
    errors.push(
      `version: ${err instanceof Error ? err.message.slice(0, 100) : String(err)}`,
    );
  }

  // ---- Per-table row counts (parallel) ----
  const tables: Array<[string, () => Promise<number>]> = [
    ["Job", () => prisma.job.count()],
    ["Submission", () => prisma.submission.count()],
    ["Delivery", () => prisma.delivery.count()],
    ["Dispute", () => prisma.dispute.count()],
    ["Profile", () => prisma.profile.count()],
    ["AgentElo", () => prisma.agentElo.count()],
    ["AgentCategoryElo", () => prisma.agentCategoryElo.count()],
    ["ArenaBattle", () => prisma.arenaBattle.count()],
    ["ClaimListing", () => prisma.claimListing.count()],
    ["HostedAgent", () => prisma.hostedAgent.count()],
    ["Transaction", () => prisma.transaction.count()],
    ["JobEvent", () => prisma.jobEvent.count()],
  ];

  await Promise.all(
    tables.map(async ([name, fn]) => {
      try {
        result.tables[name] = await retryable(fn);
      } catch (err) {
        errors.push(
          `count ${name}: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}`,
        );
        result.tables[name] = -1;
      }
    }),
  );

  // ---- Job status breakdown ----
  try {
    const groups = await retryable(() =>
      prisma.job.groupBy({
        by: ["status"],
        _count: { _all: true },
        _sum: { amount: true },
      }),
    );
    let totalAmount = 0;
    let totalCount = 0;
    for (const g of groups) {
      const count = g._count._all;
      result.jobs.by_status[g.status] = count;
      totalAmount += g._sum.amount ?? 0;
      totalCount += count;
      if (g.status === "Open") result.jobs.open_now = count;
    }
    result.jobs.total_amount_usdc = Math.round(totalAmount * 100) / 100;
    result.jobs.avg_amount_usdc =
      totalCount > 0 ? Math.round((totalAmount / totalCount) * 100) / 100 : 0;
  } catch (err) {
    errors.push(`jobs.by_status: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}`);
  }

  // ---- Completed jobs in last 24h ----
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    result.jobs.completed_in_last_24h = await retryable(() =>
      prisma.job.count({
        where: { status: { in: ["Finalized", "Completed"] }, updatedAt: { gte: since } },
      }),
    );
  } catch (err) {
    errors.push(`jobs.completed_24h: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}`);
  }

  // ---- Claim listing breakdown ----
  try {
    const groups = await retryable(() =>
      prisma.claimListing.groupBy({
        by: ["status"],
        _count: { _all: true },
        _sum: { faceValue: true },
      }),
    );
    let listedTvl = 0;
    for (const g of groups) {
      result.claims.by_status[g.status] = g._count._all;
      if (g.status === "Listed") listedTvl += g._sum.faceValue ?? 0;
    }
    result.claims.active_tvl_usdc = Math.round(listedTvl * 100) / 100;
  } catch (err) {
    errors.push(`claims: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}`);
  }

  // ---- Arena recent ----
  try {
    result.arena.total_battles = await retryable(() => prisma.arenaBattle.count());
    const last = await retryable(() =>
      prisma.arenaBattle.findFirst({
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    );
    result.arena.last_battle_at = last?.createdAt.toISOString() ?? null;
  } catch (err) {
    errors.push(`arena: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}`);
  }

  // Refresh cache stats one more time (the calls above warmed it).
  result.cache = memoizeStats();
  result.duration_ms = Date.now() - startedAt;

  reqLog.info("db-stats served", {
    duration_ms: result.duration_ms,
    table_count: Object.keys(result.tables).length,
    job_count: result.tables.Job,
    error_count: errors.length,
  });

  return ok(result);
}
