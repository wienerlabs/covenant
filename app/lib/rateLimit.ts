import { IS_MAINNET } from "@/lib/network";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

/**
 * Production-tuned limits per logical operation. Mainnet values
 * are tighter (real money at stake → Sybil attempts cost more).
 *
 * Use `getLimit("create_job")` instead of hardcoding limits at the
 * call site so cluster switching automatically tightens the gate.
 */
const LIMIT_TABLE: Record<string, { devnet: number; mainnet: number; windowMs: number }> = {
  create_job:    { devnet: 20, mainnet: 5,  windowMs: 60_000 },
  accept_job:    { devnet: 30, mainnet: 10, windowMs: 60_000 },
  submit_work:   { devnet: 30, mainnet: 10, windowMs: 60_000 },
  finalize:      { devnet: 30, mainnet: 10, windowMs: 60_000 },
  cancel:        { devnet: 30, mainnet: 10, windowMs: 60_000 },
  raise_dispute: { devnet: 10, mainnet: 3,  windowMs: 60_000 },
  list_claim:    { devnet: 30, mainnet: 10, windowMs: 60_000 },
  buy_claim:     { devnet: 30, mainnet: 10, windowMs: 60_000 },
  faucet:        { devnet: 1,  mainnet: 0,  windowMs: 60 * 60_000 }, // 0 = disabled on mainnet
  arena_run:     { devnet: 60, mainnet: 20, windowMs: 60_000 },
  battle_run:    { devnet: 60, mainnet: 20, windowMs: 60_000 },
  agent_hire:    { devnet: 30, mainnet: 10, windowMs: 60_000 },
  spectator_chat: { devnet: 30, mainnet: 30, windowMs: 60_000 },
};

/**
 * Returns the cluster-appropriate (limit, windowMs) for a named op.
 * Falls back to the dev limit if the op isn't known.
 */
export function getLimit(op: keyof typeof LIMIT_TABLE | string): { limit: number; windowMs: number } {
  const cfg = LIMIT_TABLE[op as keyof typeof LIMIT_TABLE];
  if (!cfg) return { limit: 30, windowMs: 60_000 };
  return {
    limit: IS_MAINNET ? cfg.mainnet : cfg.devnet,
    windowMs: cfg.windowMs,
  };
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
