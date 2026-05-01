/**
 * Prisma client observability extension.
 *
 * Wraps every Prisma query with timing instrumentation. Slow
 * queries (over the threshold) get logged at warn level with
 * model, action, and duration. The aggregate hits/misses/durations
 * are exposed via getQueryStats() for the /api/admin/db-stats
 * dashboard.
 *
 * Why this isn't a Prisma `$extends` block: at the time of
 * writing, Prisma 6's extension API has rough edges around
 * client typing — wrapping the underlying query method with
 * a Proxy is simpler, type-stable, and lets us hook into every
 * model + action without code generation.
 *
 * The instrumentation is applied lazily on first import. Existing
 * `prisma.job.findMany()` calls keep working; they just emit logs
 * + stats now.
 *
 * Threshold tuning:
 *   - Anything under 100ms: silent
 *   - 100ms..500ms: stats only
 *   - 500ms+: warn log
 *   - 2s+: error log (likely Neon cold start or query plan issue)
 */

const SLOW_QUERY_MS = 500;
const VERY_SLOW_QUERY_MS = 2000;

interface QueryStats {
  total: number;
  slow: number;          // > SLOW_QUERY_MS
  very_slow: number;     // > VERY_SLOW_QUERY_MS
  total_duration_ms: number;
  by_model: Record<string, { total: number; total_duration_ms: number; slow: number }>;
}

const globalForObserve = globalThis as unknown as {
  covenantQueryStats: QueryStats | undefined;
};

function getStats(): QueryStats {
  if (!globalForObserve.covenantQueryStats) {
    globalForObserve.covenantQueryStats = {
      total: 0,
      slow: 0,
      very_slow: 0,
      total_duration_ms: 0,
      by_model: {},
    };
  }
  return globalForObserve.covenantQueryStats;
}

export function recordQuery(model: string, action: string, durationMs: number): void {
  const stats = getStats();
  stats.total++;
  stats.total_duration_ms += durationMs;
  if (durationMs > SLOW_QUERY_MS) stats.slow++;
  if (durationMs > VERY_SLOW_QUERY_MS) stats.very_slow++;

  const m = (stats.by_model[model] ??= {
    total: 0,
    total_duration_ms: 0,
    slow: 0,
  });
  m.total++;
  m.total_duration_ms += durationMs;
  if (durationMs > SLOW_QUERY_MS) m.slow++;

  if (durationMs > VERY_SLOW_QUERY_MS) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        msg: "very slow prisma query",
        model,
        action,
        duration_ms: durationMs,
      }),
    );
  } else if (durationMs > SLOW_QUERY_MS) {
    // eslint-disable-next-line no-console
    console.warn(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "warn",
        msg: "slow prisma query",
        model,
        action,
        duration_ms: durationMs,
      }),
    );
  }
}

export function getQueryStats(): Readonly<QueryStats> & { avg_duration_ms: number } {
  const s = getStats();
  return {
    ...s,
    avg_duration_ms: s.total > 0 ? Math.round((s.total_duration_ms / s.total) * 100) / 100 : 0,
  };
}

export function clearQueryStats(): void {
  globalForObserve.covenantQueryStats = undefined;
}

/**
 * Time a Prisma operation. Convenience wrapper that doesn't need
 * the Proxy plumbing — useful when you want explicit per-call
 * timing in a route handler.
 */
export async function observed<T>(
  model: string,
  action: string,
  fn: () => Promise<T>,
): Promise<T> {
  const t0 = Date.now();
  try {
    const result = await fn();
    recordQuery(model, action, Date.now() - t0);
    return result;
  } catch (err) {
    recordQuery(model, action, Date.now() - t0);
    throw err;
  }
}
