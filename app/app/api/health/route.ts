import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
export async function GET() {
  const result: {
    ok: boolean;
    timestamp: string;
    cluster: string;
    checks: Record<string, { ok: boolean; detail?: string }>;
  } = {
    ok: true,
    timestamp: new Date().toISOString(),
    cluster: "devnet",
    checks: {},
  };

  // ---- 1. Database connectivity ----
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const ms = Date.now() - start;
    result.checks.database = { ok: true, detail: `roundtrip=${ms}ms` };
  } catch (err) {
    result.ok = false;
    result.checks.database = {
      ok: false,
      detail: err instanceof Error ? err.message.slice(0, 200) : String(err),
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

  return NextResponse.json(result, { status: 200 });
}
