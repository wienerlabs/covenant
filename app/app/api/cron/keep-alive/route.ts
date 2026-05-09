import { NextRequest, NextResponse } from "next/server";
import { prisma, retryable } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

/**
 * GET /api/cron/keep-alive
 *
 * Database warmer. Vercel Cron pings this every 4 minutes to keep
 * the Neon free-tier Postgres awake, since Neon auto-pauses after
 * 5 minutes of idle and the resulting cold start kills the first
 * request after pause.
 *
 * The route also opportunistically warms a few hot tables so the
 * Prisma client's prepared statement cache is primed.
 *
 * Authentication: optional. If CRON_SECRET is set, the route
 * accepts either:
 *   - Vercel's cron-injected `Authorization: Bearer ${CRON_SECRET}`
 *   - Or no auth (so manual GET works for debugging)
 *
 * The cron runs every 4 minutes (faster than Neon's 5-min pause
 * timer with safety margin). Schedule lives in vercel.json.
 */
export async function GET(request: NextRequest) {
  const startedAt = Date.now();

  // Optional auth — only enforced if CRON_SECRET is set AND the
  // request actually carries an Authorization header. This lets
  // manual `curl /api/cron/keep-alive` keep working for debugging
  // while production cron requests with the right bearer pass.
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = request.headers.get("authorization");
    if (auth && auth !== `Bearer ${expected}`) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }
  }

  const result: {
    ok: boolean;
    durationMs: number;
    coldStart: boolean;
    checks: Record<string, { ok: boolean; ms: number; detail?: string }>;
  } = {
    ok: true,
    durationMs: 0,
    coldStart: false,
    checks: {},
  };

  // ---- 1. Bare connectivity probe ----
  try {
    const t0 = Date.now();
    await retryable(() => prisma.$queryRaw`SELECT 1 AS ping`);
    const ms = Date.now() - t0;
    result.checks.ping = { ok: true, ms };
    if (ms > 1500) result.coldStart = true;
  } catch (err) {
    result.ok = false;
    result.checks.ping = {
      ok: false,
      ms: 0,
      detail: err instanceof Error ? err.message.slice(0, 200) : String(err),
    };
  }

  // ---- 2. Hot-table warmers (only if ping succeeded) ----
  // These COUNT(*)s are cheap and prime Prisma's prepared
  // statement cache for the most-hit endpoints. If the DB is
  // already warm they take ~5ms each; if cold the first one
  // pays the wake-up cost which retryable() handles.
  if (result.checks.ping.ok) {
    const warmers: Array<[string, () => Promise<unknown>]> = [
      ["job", () => prisma.job.count()],
      ["agentElo", () => prisma.agentElo.count()],
      ["claimListing", () => prisma.claimListing.count()],
      ["arenaBattle", () => prisma.arenaBattle.count()],
      ["hostedAgent", () => prisma.hostedAgent.count()],
    ];
    await Promise.all(
      warmers.map(async ([label, fn]) => {
        const t0 = Date.now();
        try {
          await retryable(fn);
          result.checks[label] = { ok: true, ms: Date.now() - t0 };
        } catch (err) {
          result.checks[label] = {
            ok: false,
            ms: Date.now() - t0,
            detail: err instanceof Error ? err.message.slice(0, 120) : String(err),
          };
          // Don't flip the top-level ok — partial table warm-up is
          // still useful and a missing table here would be an
          // ensureSchema problem we surface elsewhere.
        }
      }),
    );
  }

  result.durationMs = Date.now() - startedAt;
  return NextResponse.json(result, { status: 200 });
}
