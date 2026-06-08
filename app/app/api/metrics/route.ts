import { NextRequest } from "next/server";
import { prisma, retryable } from "@/lib/prisma";
import { memoizeStats } from "@/lib/cache";
import { getQueryStats } from "@/lib/prisma-observe";
import { idempotencyStats } from "@/lib/idempotency";
import { bufferStats } from "@/lib/error-buffer";
import { getServerConnection } from "@/lib/program-server";
import { PROTOCOL_FEE_BPS } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/metrics
 *
 * Prometheus exposition format. Anyone scraping this URL with
 * Prometheus / Grafana Agent / Datadog can ingest it as-is — no
 * pushgateway, no special config. Auth: optional Bearer
 * METRICS_SECRET (or CRON_SECRET). When unset, the endpoint is
 * open since none of the values are sensitive.
 *
 * Metrics emitted:
 *
 *   covenant_build_info{commit, region, cluster}      gauge=1
 *   covenant_db_table_rows{table}                     gauge
 *   covenant_jobs_by_status{status}                   gauge
 *   covenant_jobs_total_amount_usdc                   gauge
 *   covenant_claims_active_tvl_usdc                   gauge
 *   covenant_claims_by_status{status}                 gauge
 *   covenant_arena_battles_total                      gauge
 *   covenant_settlement_volume_usdc                   gauge
 *   covenant_fees_accrued_usdc                        gauge
 *   covenant_disputes_total                           counter
 *   covenant_disputes_by_resolution{resolution}       gauge
 *   covenant_dispute_rate                             gauge
 *   covenant_rpc_up                                   gauge=1|0
 *   covenant_rpc_slot                                 gauge
 *   covenant_rpc_latency_ms                           gauge
 *   covenant_cache_hits_total                         counter
 *   covenant_cache_misses_total                       counter
 *   covenant_cache_stale_hits_total                   counter
 *   covenant_cache_evictions_total                    counter
 *   covenant_cache_size                               gauge
 *   covenant_query_total                              counter
 *   covenant_query_slow_total                         counter
 *   covenant_query_very_slow_total                    counter
 *   covenant_query_avg_duration_ms                    gauge
 *   covenant_idempotency_size                         gauge
 *   covenant_idempotency_inflight                     gauge
 *   covenant_error_buffer_count                       gauge
 *   covenant_db_up                                    gauge=1|0
 *
 * The text format is:
 *   # HELP <metric> <description>
 *   # TYPE <metric> <type>
 *   <metric>{label="value"} <number>
 */
function authorized(req: NextRequest): boolean {
  const secret = process.env.METRICS_SECRET || process.env.CRON_SECRET;
  if (!secret) return true; // open by default
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

interface Metric {
  name: string;
  help: string;
  type: "gauge" | "counter";
  values: Array<{ labels?: Record<string, string>; value: number }>;
}

function renderPrometheus(metrics: Metric[]): string {
  const lines: string[] = [];
  for (const m of metrics) {
    lines.push(`# HELP ${m.name} ${m.help}`);
    lines.push(`# TYPE ${m.name} ${m.type}`);
    for (const v of m.values) {
      const lbls = v.labels
        ? "{" +
          Object.entries(v.labels)
            .map(([k, val]) => `${k}="${escapeLabel(val)}"`)
            .join(",") +
          "}"
        : "";
      lines.push(`${m.name}${lbls} ${v.value}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function escapeLabel(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const metrics: Metric[] = [];

  // ---- Build info ----
  metrics.push({
    name: "covenant_build_info",
    help: "Static info about this build, value is always 1.",
    type: "gauge",
    values: [
      {
        labels: {
          commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "unknown",
          region: process.env.VERCEL_REGION ?? "unknown",
          cluster: "devnet",
        },
        value: 1,
      },
    ],
  });

  // ---- DB ----
  const dbUp: Metric = {
    name: "covenant_db_up",
    help: "1 if the database is reachable, 0 otherwise.",
    type: "gauge",
    values: [{ value: 0 }],
  };

  let jobCounts: Array<{ status: string; _count: { _all: number }; _sum: { amount: number | null } }> = [];
  let claimCounts: Array<{ status: string; _count: { _all: number }; _sum: { faceValue: number | null } }> = [];
  let arenaCount = 0;
  let disputeGroups: Array<{ resolution: string | null; _count: { _all: number } }> = [];
  const tableMetric: Metric = {
    name: "covenant_db_table_rows",
    help: "Row count per table.",
    type: "gauge",
    values: [],
  };
  const totalAmount: Metric = {
    name: "covenant_jobs_total_amount_usdc",
    help: "Sum of all job amounts in USDC.",
    type: "gauge",
    values: [{ value: 0 }],
  };
  const tvl: Metric = {
    name: "covenant_claims_active_tvl_usdc",
    help: "Face value of currently Listed claim listings, in USDC.",
    type: "gauge",
    values: [{ value: 0 }],
  };

  try {
    await retryable(() => prisma.$queryRaw`SELECT 1`);
    dbUp.values[0].value = 1;

    const tables: Array<[string, () => Promise<number>]> = [
      ["Job", () => prisma.job.count()],
      ["Submission", () => prisma.submission.count()],
      ["Profile", () => prisma.profile.count()],
      ["AgentElo", () => prisma.agentElo.count()],
      ["ClaimListing", () => prisma.claimListing.count()],
      ["HostedAgent", () => prisma.hostedAgent.count()],
      ["ArenaBattle", () => prisma.arenaBattle.count()],
      ["Transaction", () => prisma.transaction.count()],
    ];
    const counts = await Promise.allSettled(tables.map(([, fn]) => retryable(fn)));
    counts.forEach((r, i) => {
      tableMetric.values.push({
        labels: { table: tables[i][0] },
        value: r.status === "fulfilled" ? r.value : -1,
      });
    });

    [jobCounts, claimCounts, arenaCount, disputeGroups] = await Promise.all([
      retryable(() =>
        prisma.job.groupBy({
          by: ["status"],
          _count: { _all: true },
          _sum: { amount: true },
        }),
      ).catch(() => []),
      retryable(() =>
        prisma.claimListing.groupBy({
          by: ["status"],
          _count: { _all: true },
          _sum: { faceValue: true },
        }),
      ).catch(() => []),
      retryable(() => prisma.arenaBattle.count()).catch(() => 0),
      retryable(() =>
        prisma.dispute.groupBy({ by: ["resolution"], _count: { _all: true } }),
      ).catch(() => []),
    ]);

    let amountSum = 0;
    for (const g of jobCounts) {
      amountSum += g._sum.amount ?? 0;
    }
    totalAmount.values[0].value = Math.round(amountSum * 100) / 100;

    let listedTvl = 0;
    for (const g of claimCounts) {
      if (g.status === "Listed") {
        listedTvl += g._sum.faceValue ?? 0;
      }
    }
    tvl.values[0].value = Math.round(listedTvl * 100) / 100;
  } catch {
    /* dbUp stays 0 */
  }

  metrics.push(dbUp);
  metrics.push(tableMetric);
  metrics.push(totalAmount);
  metrics.push(tvl);

  metrics.push({
    name: "covenant_jobs_by_status",
    help: "Job count by status.",
    type: "gauge",
    values: jobCounts.map((g) => ({
      labels: { status: g.status },
      value: g._count._all,
    })),
  });

  metrics.push({
    name: "covenant_claims_by_status",
    help: "Claim listing count by status.",
    type: "gauge",
    values: claimCounts.map((g) => ({
      labels: { status: g.status },
      value: g._count._all,
    })),
  });

  metrics.push({
    name: "covenant_arena_battles_total",
    help: "Total arena battles ever recorded.",
    type: "counter",
    values: [{ value: arenaCount }],
  });

  // ---- Settlement volume + protocol fee accrual (Finalized jobs only) ----
  // Settlement volume mirrors real on-chain settlement: only jobs that reached
  // Finalized count. Fees are derived from that settled volume at the protocol
  // rate (not a fabricated figure) — when settlement is 0, both read 0.
  let finalizedVolume = 0;
  for (const g of jobCounts) {
    if (g.status === "Finalized") finalizedVolume += g._sum.amount ?? 0;
  }
  finalizedVolume = Math.round(finalizedVolume * 100) / 100;
  metrics.push({
    name: "covenant_settlement_volume_usdc",
    help: "Sum of job amounts that reached Finalized (settled) state, in USDC.",
    type: "gauge",
    values: [{ value: finalizedVolume }],
  });
  metrics.push({
    name: "covenant_fees_accrued_usdc",
    help: `Protocol fees accrued on settled volume (settlement_volume * ${PROTOCOL_FEE_BPS}bps), in USDC.`,
    type: "gauge",
    values: [{ value: Math.round((finalizedVolume * PROTOCOL_FEE_BPS) / 10000 * 100) / 100 }],
  });

  // ---- Dispute volume + rate ----
  const disputesTotal = disputeGroups.reduce((s, g) => s + g._count._all, 0);
  const jobsTotal = jobCounts.reduce((s, g) => s + g._count._all, 0);
  metrics.push({
    name: "covenant_disputes_total",
    help: "Total disputes ever raised.",
    type: "counter",
    values: [{ value: disputesTotal }],
  });
  metrics.push({
    name: "covenant_disputes_by_resolution",
    help: "Dispute count by resolution (Pending/FavorTaker/FavorPoster/Split).",
    type: "gauge",
    values: disputeGroups.length
      ? disputeGroups.map((g) => ({
          labels: { resolution: g.resolution ?? "Pending" },
          value: g._count._all,
        }))
      : [{ labels: { resolution: "none" }, value: 0 }],
  });
  metrics.push({
    name: "covenant_dispute_rate",
    help: "Disputes as a fraction of all jobs (0..1).",
    type: "gauge",
    values: [
      { value: jobsTotal > 0 ? Math.round((disputesTotal / jobsTotal) * 10000) / 10000 : 0 },
    ],
  });

  // ---- Cache ----
  const c = memoizeStats();
  metrics.push({ name: "covenant_cache_hits_total", help: "Cache hit count.", type: "counter", values: [{ value: c.hits }] });
  metrics.push({ name: "covenant_cache_misses_total", help: "Cache miss count.", type: "counter", values: [{ value: c.misses }] });
  metrics.push({ name: "covenant_cache_stale_hits_total", help: "Cache stale-hit count.", type: "counter", values: [{ value: c.staleHits }] });
  metrics.push({ name: "covenant_cache_evictions_total", help: "Cache LRU eviction count.", type: "counter", values: [{ value: c.evictions }] });
  metrics.push({ name: "covenant_cache_errors_total", help: "Cache loader error count.", type: "counter", values: [{ value: c.errors }] });
  metrics.push({ name: "covenant_cache_size", help: "Current cache entry count.", type: "gauge", values: [{ value: c.size }] });

  // ---- Query observability ----
  const q = getQueryStats();
  metrics.push({ name: "covenant_query_total", help: "Total Prisma queries observed.", type: "counter", values: [{ value: q.total }] });
  metrics.push({ name: "covenant_query_slow_total", help: "Queries slower than 500ms.", type: "counter", values: [{ value: q.slow }] });
  metrics.push({ name: "covenant_query_very_slow_total", help: "Queries slower than 2s.", type: "counter", values: [{ value: q.very_slow }] });
  metrics.push({ name: "covenant_query_avg_duration_ms", help: "Average Prisma query duration in ms.", type: "gauge", values: [{ value: q.avg_duration_ms }] });

  // ---- Idempotency ----
  const idem = idempotencyStats();
  metrics.push({ name: "covenant_idempotency_size", help: "Idempotency keys held.", type: "gauge", values: [{ value: idem.size }] });
  metrics.push({ name: "covenant_idempotency_inflight", help: "Idempotency keys currently in-flight.", type: "gauge", values: [{ value: idem.inflight }] });

  // ---- Error buffer ----
  const eb = bufferStats();
  metrics.push({ name: "covenant_error_buffer_count", help: "Error log entries in the in-memory ring buffer.", type: "gauge", values: [{ value: eb.count }] });

  // ---- RPC health (live getSlot probe) ----
  const rpcUp: Metric = { name: "covenant_rpc_up", help: "1 if the Solana RPC responded to getSlot, 0 otherwise.", type: "gauge", values: [{ value: 0 }] };
  const rpcSlot: Metric = { name: "covenant_rpc_slot", help: "Current Solana slot reported by the RPC (0 if unreachable).", type: "gauge", values: [{ value: 0 }] };
  const rpcLatency: Metric = { name: "covenant_rpc_latency_ms", help: "RPC getSlot round-trip latency in ms (0 if unreachable).", type: "gauge", values: [{ value: 0 }] };
  try {
    const conn = getServerConnection();
    const t0 = Date.now();
    const slot = await Promise.race([
      conn.getSlot(),
      new Promise<number>((_, reject) => setTimeout(() => reject(new Error("timeout")), 4000)),
    ]);
    rpcUp.values[0].value = 1;
    rpcSlot.values[0].value = slot;
    rpcLatency.values[0].value = Date.now() - t0;
  } catch {
    /* rpcUp stays 0 */
  }
  metrics.push(rpcUp, rpcSlot, rpcLatency);

  return new Response(renderPrometheus(metrics), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
