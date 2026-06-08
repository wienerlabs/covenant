import { NextRequest, NextResponse } from "next/server";
import { prisma, retryable } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { getServerConnection } from "@/lib/program-server";
import { PROGRAM_ID } from "@/lib/network";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errDetail(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 200) : String(err);
}

/** Race a promise against a timeout so a hung RPC can't stall the health check. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

/**
 * GET /api/health
 *
 * Lightweight diagnostic endpoint. Returns the status of every
 * external dependency the app needs in order to function:
 *
 *   - database  : Postgres reachable + readable
 *   - schema    : key tables exist (Job, AgentElo, ClaimListing)
 *   - env       : required env vars present
 *   - rpc       : Solana RPC reachable (getSlot)
 *   - program   : Covenant program account deployed + executable
 *   - crank     : settlement crank keeping up (no overdue finalize backlog)
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

  // ---- 4. Solana RPC + on-chain program reachability ----
  try {
    const conn = getServerConnection();
    const slot = await withTimeout(conn.getSlot(), 4000, "rpc.getSlot");
    result.checks.rpc = { ok: true, detail: `slot=${slot}` };

    // Reachability only: the program account exists + is executable. This is
    // deliberately not a correctness check (a deployed-but-buggy program still
    // reports reachable), which is the honest meaning of "program reachable".
    try {
      const info = await withTimeout(conn.getAccountInfo(PROGRAM_ID), 4000, "rpc.getAccountInfo");
      const reachable = !!info && info.executable;
      result.checks.program = {
        ok: reachable,
        detail: reachable
          ? `deployed + executable (${PROGRAM_ID.toBase58().slice(0, 8)}…)`
          : "program account not found or not executable",
      };
      if (!reachable) result.ok = false;
    } catch (err) {
      result.ok = false;
      result.checks.program = { ok: false, detail: errDetail(err) };
    }
  } catch (err) {
    result.ok = false;
    result.checks.rpc = { ok: false, detail: errDetail(err) };
    result.checks.program = { ok: false, detail: "skipped (rpc down)" };
  }

  // ---- 5. Crank liveness: no overdue settlement backlog ----
  // The cron finalizer settles Delivered jobs whose challenge window has
  // closed (status=Delivered, challengeEndAt<=now). A non-empty overdue
  // backlog means the crank is not keeping up. Tolerance is operator-tunable
  // via HEALTH_CRANK_BACKLOG_MAX (default 0).
  if (result.checks.database.ok) {
    try {
      const now = new Date();
      const [overdue, lastFinalize] = await Promise.all([
        prisma.job
          .count({ where: { status: "Delivered", challengeEndAt: { lte: now } } })
          .catch(() => -1),
        prisma.transaction
          .findFirst({
            where: { type: "finalize_payment" },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
          })
          .catch(() => null),
      ]);
      const backlogMax = Number(process.env.HEALTH_CRANK_BACKLOG_MAX ?? 0);
      const ok = overdue >= 0 && overdue <= backlogMax;
      result.checks.crank = {
        ok,
        detail: `overdue_finalize=${overdue}, last_finalize=${
          lastFinalize?.createdAt?.toISOString() ?? "never"
        }`,
      };
      if (!ok) result.ok = false;
    } catch (err) {
      result.ok = false;
      result.checks.crank = { ok: false, detail: errDetail(err) };
    }
  } else {
    result.checks.crank = { ok: false, detail: "skipped (db down)" };
  }

  result.duration_ms = Date.now() - startedAt;
  reqLog.info("health check", {
    ok: result.ok,
    duration_ms: result.duration_ms,
    db_ok: result.checks.database?.ok,
    schema_ok: result.checks.schema?.ok,
    rpc_ok: result.checks.rpc?.ok,
    program_ok: result.checks.program?.ok,
    crank_ok: result.checks.crank?.ok,
    commit: result.commit,
  });

  return NextResponse.json(result, { status: 200 });
}
