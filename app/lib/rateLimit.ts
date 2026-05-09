interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

/**
 * Devnet-tuned per-operation rate limits. Use `getLimit("create_job")`
 * instead of hardcoding numbers at the call site so the table stays
 * the single source of truth.
 */
const LIMIT_TABLE: Record<string, { limit: number; windowMs: number }> = {
  create_job:    { limit: 20, windowMs: 60_000 },
  accept_job:    { limit: 30, windowMs: 60_000 },
  submit_work:   { limit: 30, windowMs: 60_000 },
  finalize:      { limit: 30, windowMs: 60_000 },
  cancel:        { limit: 30, windowMs: 60_000 },
  raise_dispute: { limit: 10, windowMs: 60_000 },
  list_claim:    { limit: 30, windowMs: 60_000 },
  buy_claim:     { limit: 30, windowMs: 60_000 },
  faucet:        { limit: 1,  windowMs: 60 * 60_000 },
  arena_run:     { limit: 60, windowMs: 60_000 },
  battle_run:    { limit: 60, windowMs: 60_000 },
  agent_hire:    { limit: 30, windowMs: 60_000 },
  spectator_chat: { limit: 30, windowMs: 60_000 },
};

/** Returns the (limit, windowMs) for a named op. Falls back to a sane default. */
export function getLimit(op: keyof typeof LIMIT_TABLE | string): { limit: number; windowMs: number } {
  return LIMIT_TABLE[op as keyof typeof LIMIT_TABLE] ?? { limit: 30, windowMs: 60_000 };
}

/**
 * In-memory rate limiter.
 * @param key     Unique identifier for the caller (e.g. IP or route key)
 * @param limit   Maximum number of requests allowed per window
 * @param windowMs Duration of the window in milliseconds (default: 60 000 ms = 1 min)
 * @returns `{ allowed: boolean; remaining: number; resetAt: number }`
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs = 60_000
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now >= entry.resetAt) {
    // Start a new window
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

/**
 * Periodically purge expired entries to prevent unbounded memory growth.
 * This runs once when the module is first imported (server startup).
 */
setInterval(() => {
  const now = Date.now();
  const keysToDelete: string[] = [];
  store.forEach((entry, key) => {
    if (now >= entry.resetAt) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach((key) => store.delete(key));
}, 60_000);
