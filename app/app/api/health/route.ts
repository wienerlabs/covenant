import { NextRequest, NextResponse } from "next/server";
import { prisma, retryable } from "@/lib/prisma";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/health
 *
 * Lightweight diagnostic endpoint. Returns the status of every
 * external dependency the app needs in order to function:
 *
 *   - database  : Postgres reachable + readable
 *   - schema    : key tables exist (Job, AgentElo, ClaimListing)
 *   - env       : required env vars present
 *
 * Always returns HTTP 200 so monitoring tools see the JSON body
 * rather than a generic error page. The `ok` field summarizes.
 */
export async function GET(request: NextRequest) {
  const reqLog = log.forRequest(request);
  const startedAt = Date.now();

  const result: {
    ok: boolean;
    timestamp: string;
    cluster: string;
    duration_ms: number;
    commit: string | null;
    region: string | null;
    checks: Record<string, { ok: boolean; detail?: string }>;
  } = {
    ok: true,
    timestamp: new Date().toISOString(),
    cluster: "devnet",
    duration_ms: 0,
    // Surface the deployed commit + region so support requests can
    // be correlated to a specific Vercel deployment.
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    region: process.env.VERCEL_REGION ?? null,
    checks: {},
  };

  // ---- 1. Database connectivity ----
  try {
    const start = Date.now();
    await retryable(() => prisma.$queryRaw`SELECT 1`);
    const ms = Date.now() - start;
    result.checks.database = {
      ok: true,
      detail: ms > 1000 ? `roundtrip=${ms}ms (cold start)` : `roundtrip=${ms}ms`,
    };
  } catch (err) {
    result.ok = false;
    result.checks.database = {
      ok: false,
      detail: err instanceof Error ? err.message.slice(0, 300) : String(err),
    };
  }

  // ---- 2. Schema sanity (only meaningful if DB is up) ----
  if (result.checks.database.ok) {
    try {
      const [jobCount, eloCount, claimCount] = await Promise.all([
        prisma.job.count().catch(() => -1),
        prisma.agentElo.count().catch(() => -1),
        prisma.claimListing.count().catch(() => -1),
      ]);
      const tablesPresent = jobCount >= 0 && eloCount >= 0 && claimCount >= 0;
      result.checks.schema = {
        ok: tablesPresent,
        detail: `Job=${jobCount}, AgentElo=${eloCount}, ClaimListing=${claimCount}`,
      };
      if (!tablesPresent) result.ok = false;
    } catch (err) {
      result.ok = false;
      result.checks.schema = {
        ok: false,
        detail: err instanceof Error ? err.message.slice(0, 200) : String(err),
      };
    }
  } else {
    result.checks.schema = { ok: false, detail: "skipped (db down)" };
  }

  // ---- 3. Env var presence (without leaking values) ----
  const required = ["DATABASE_URL", "ANTHROPIC_API_KEY"];
  const missing = required.filter((k) => !process.env[k]);
  result.checks.env = {
    ok: missing.length === 0,
    detail: missing.length === 0 ? "all set" : `missing: ${missing.join(", ")}`,
  };
  if (missing.length > 0) result.ok = false;

  result.duration_ms = Date.now() - startedAt;
  reqLog.info("health check", {
    ok: result.ok,
    duration_ms: result.duration_ms,
    db_ok: result.checks.database?.ok,
    schema_ok: result.checks.schema?.ok,
    commit: result.commit,
  });

  return NextResponse.json(result, { status: 200 });
}
