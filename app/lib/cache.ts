/**
 * In-memory LRU cache with TTL.
 *
 * Vercel serverless functions are short-lived but warm instances
 * handle many requests, so a per-instance cache is genuinely
 * useful for hot reads — especially the leaderboard / claims list
 * / arena recent that get hit on every page load and don't change
 * meaningfully more often than once per few seconds.
 *
 * Design constraints:
 *   - Zero dependencies. We don't want lru-cache or quick-lru in
 *     the install graph just for this.
 *   - Bounded memory. Hard cap on entry count so a runaway cache
 *     can't OOM a function instance.
 *   - TTL per entry. Different routes have different freshness
 *     budgets.
 *   - Stale-while-revalidate semantics. If a key has expired but
 *     a refresh is already in flight, return the stale value
 *     instead of stampeding the DB.
 *
 * Usage:
 *
 *   const cache = new TTLCache<string, EloRow[]>({ max: 100 });
 *
 *   const rows = await cache.getOrSet(
 *     "elo:top50",
 *     5_000,
 *     () => prisma.agentElo.findMany({ orderBy: { elo: "desc" }, take: 50 }),
 *   );
 *
 * `cache.getOrSet(key, ttlMs, loader)` always returns a value:
 *   - cache hit + fresh   → return cached
 *   - cache hit + stale   → fire loader in background, return stale
 *   - cache miss          → await loader, set, return
 *
 * Errors thrown by `loader` propagate on the *cache miss* path
 * but are swallowed on the stale-while-revalidate path (logged
 * and the next request retries).
 */

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
  // Last access time for LRU eviction order.
  hitAt: number;
}

export interface TTLCacheOptions {
  /** Maximum number of entries before LRU eviction kicks in. */
  max?: number;
  /** Default TTL for entries that don't specify one explicitly. */
  defaultTtlMs?: number;
}

export class TTLCache<K, V> {
  private store = new Map<K, CacheEntry<V>>();
  private inflight = new Map<K, Promise<V>>();
  private readonly max: number;
  private readonly defaultTtlMs: number;

  // Stats — useful for /api/admin/cache-stats and SLO monitoring.
  private stats = {
    hits: 0,
    misses: 0,
    staleHits: 0,
    evictions: 0,
    errors: 0,
  };

  constructor(opts: TTLCacheOptions = {}) {
    this.max = opts.max ?? 200;
    this.defaultTtlMs = opts.defaultTtlMs ?? 5_000;
  }

  /**
   * Get without touching the loader. Returns undefined on miss or
   * expiry. Doesn't update hit stats — used for read-throughs by
   * external observers.
   */
  peek(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) return undefined;
    return entry.value;
  }

  /**
   * Set a value with explicit TTL. If the cache is full, evicts
   * the least-recently-accessed entry first.
   */
  set(key: K, value: V, ttlMs?: number): void {
    if (this.store.size >= this.max && !this.store.has(key)) {
      const oldestKey = this.findLruKey();
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
        this.stats.evictions++;
      }
    }
    const ttl = ttlMs ?? this.defaultTtlMs;
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttl,
      hitAt: Date.now(),
    });
  }

  /**
   * Cache-aside helper. Returns the cached value if fresh, returns
   * the stale value while triggering a background refresh if just
   * expired, or fetches synchronously on miss.
   */
  async getOrSet(key: K, ttlMs: number, loader: () => Promise<V>): Promise<V> {
    const entry = this.store.get(key);
    const now = Date.now();

    if (entry && now < entry.expiresAt) {
      this.stats.hits++;
      entry.hitAt = now;
      return entry.value;
    }

    // Stale-while-revalidate: serve stale value, refresh in background.
    if (entry && now >= entry.expiresAt) {
      this.stats.staleHits++;
      entry.hitAt = now; // touch so it doesn't get evicted while refreshing
      if (!this.inflight.has(key)) {
        const refresh = loader()
          .then((v) => {
            this.set(key, v, ttlMs);
            return v;
          })
          .catch((err) => {
            this.stats.errors++;
            // eslint-disable-next-line no-console
            console.warn(`[cache] background refresh failed for ${String(key)}:`, err);
            // Fall through — keep returning the stale value until
            // the next miss attempts a synchronous load.
            throw err;
          })
          .finally(() => {
            this.inflight.delete(key);
          });
        this.inflight.set(key, refresh);
      }
      return entry.value;
    }

    // Cache miss — coalesce concurrent loaders.
    this.stats.misses++;
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const p = loader()
      .then((v) => {
        this.set(key, v, ttlMs);
        return v;
      })
      .finally(() => {
        this.inflight.delete(key);
      });
    this.inflight.set(key, p);
    return p;
  }

  delete(key: K): boolean {
    return this.store.delete(key);
  }

  clear(): number {
    const n = this.store.size;
    this.store.clear();
    this.inflight.clear();
    return n;
  }

  size(): number {
    return this.store.size;
  }

  getStats(): Readonly<typeof this.stats> & { size: number; max: number } {
    return { ...this.stats, size: this.store.size, max: this.max };
  }

  private findLruKey(): K | undefined {
    let oldestKey: K | undefined;
    let oldestHit = Infinity;
    for (const [k, v] of this.store) {
      if (v.hitAt < oldestHit) {
        oldestHit = v.hitAt;
        oldestKey = k;
      }
    }
    return oldestKey;
  }
}

/**
 * Global default cache — module-level singleton scoped to globalThis
 * so it survives Next.js HMR + Vercel function instance reuse. Use
 * for ad-hoc memoization where you don't want to construct your own.
 */

const globalForCache = globalThis as unknown as {
  covenantCache: TTLCache<string, unknown> | undefined;
};

function defaultCache(): TTLCache<string, unknown> {
  if (!globalForCache.covenantCache) {
    globalForCache.covenantCache = new TTLCache({ max: 500, defaultTtlMs: 10_000 });
  }
  return globalForCache.covenantCache;
}

export async function memoize<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  return defaultCache().getOrSet(key, ttlMs, loader as () => Promise<unknown>) as Promise<T>;
}

export function memoizeStats() {
  return defaultCache().getStats();
}

export function memoizeClear(): number {
  return defaultCache().clear();
}

export function memoizeDelete(key: string): boolean {
  return defaultCache().delete(key);
}
