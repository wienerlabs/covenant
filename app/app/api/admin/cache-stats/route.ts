import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { memoizeStats, memoizeClear, memoizeDelete } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET    /api/admin/cache-stats          → current LRU stats
 * DELETE /api/admin/cache-stats          → clear entire cache
 * DELETE /api/admin/cache-stats?key=elo:top50 → invalidate one key
 *
 * Per-instance only — Vercel serverless runs many instances and
 * each has its own cache. Useful for verifying that a deploy
 * actually warmed the leaderboard cache (hit rate ramps to >95%
 * within seconds of traffic) or for force-evicting after a
 * schema change.
 *
 * Auth: Bearer ADMIN_SECRET.
 */
function authorized(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET || process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return fail("unauthorized", "Bearer admin secret required.");
  const stats = memoizeStats();
  const total = stats.hits + stats.misses + stats.staleHits;
  const hitRate = total > 0 ? (stats.hits + stats.staleHits) / total : 0;
  return ok({
    ...stats,
    total_requests: total,
    hit_rate: Math.round(hitRate * 1000) / 1000,
    instance_uptime_ms: process.uptime ? Math.round(process.uptime() * 1000) : null,
  });
}

export async function DELETE(req: NextRequest) {
  if (!authorized(req)) return fail("unauthorized", "Bearer admin secret required.");
  const key = new URL(req.url).searchParams.get("key");
  if (key) {
    const found = memoizeDelete(key);
    return ok({ deleted: found, key });
  }
  const cleared = memoizeClear();
  return ok({ cleared, scope: "all" });
}
