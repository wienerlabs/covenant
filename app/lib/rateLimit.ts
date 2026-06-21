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
  resolve_dispute: { limit: 10, windowMs: 60_000 },
  raise_dispute_ip: { limit: 20, windowMs: 60_000 },
  stake:         { limit: 10, windowMs: 60_000 },
  unstake:       { limit: 10, windowMs: 60_000 },
  cancel_claim:  { limit: 30, windowMs: 60_000 },
  faucet_ip:     { limit: 10, windowMs: 60 * 60_000 },
  avatar_upload: { limit: 20, windowMs: 60_000 },
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
// `.unref()` so this housekeeping timer never keeps a serverless function
// (or a test process) alive on its own.
setInterval(() => {
  const now = Date.now();
  const keysToDelete: string[] = [];
  store.forEach((entry, key) => {
    if (now >= entry.resetAt) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach((key) => store.delete(key));
}, 60_000).unref?.();

/* ------------------------------------------------------------------ */
/*  Durable (distributed) rate limiter — C-092 / H-04                  */
/*                                                                     */
/*  The in-memory limiter above is per-serverless-instance, so on      */
/*  Vercel the same caller hitting a different container gets a fresh   */
/*  window — trivially bypassable under load. This variant keeps the   */
/*  counter in Postgres (shared across every instance) via an atomic    */
/*  INSERT ... ON CONFLICT increment, so concurrent requests cannot     */
/*  race past the cap. Use it on sensitive / financial endpoints.       */
/* ------------------------------------------------------------------ */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/** Pure: the fixed-window bucket key + reset time for a given instant. */
export function windowBucket(
  key: string,
  windowMs: number,
  now: number,
): { bucket: string; resetAt: number } {
  const index = Math.floor(now / windowMs);
  return { bucket: `${key}:${index}`, resetAt: (index + 1) * windowMs };
}

/** Build a compound rate-limit key from op + optional wallet + IP (H-04). */
export function compoundKey(parts: {
  op: string;
  wallet?: string | null;
  ip?: string | null;
}): string {
  return `${parts.op}:${parts.wallet || "-"}:${parts.ip || "-"}`;
}

let sweepCounter = 0;

/**
 * Distributed fixed-window rate limit, backed by the `RateLimit` table.
 * The increment is atomic, so there is no bypass under concurrent load
 * (C-092). Fails OPEN (allowed) when the DB is unreachable so a DB blip
 * can't take the whole site down — the limiter is a guard, not auth.
 */
export async function rateLimitDurable(
  key: string,
  limit: number,
  windowMs = 60_000,
  now: number = Date.now(),
): Promise<RateLimitResult> {
  const { bucket, resetAt } = windowBucket(key, windowMs, now);
  try {
    const { prisma } = await import("./prisma");
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      INSERT INTO "RateLimit" ("bucket", "count", "expiresAt")
      VALUES (${bucket}, 1, ${new Date(resetAt)})
      ON CONFLICT ("bucket") DO UPDATE SET "count" = "RateLimit"."count" + 1
      RETURNING "count"
    `;
    const count = Number(rows[0]?.count ?? 1);

    // Opportunistic cleanup of expired buckets (~every 200 calls).
    if (++sweepCounter % 200 === 0) {
      void prisma
        .$executeRaw`DELETE FROM "RateLimit" WHERE "expiresAt" < ${new Date(now)}`
        .catch(() => {});
    }

    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt,
    };
  } catch (err) {
    console.error(
      "[rateLimit] durable check failed, allowing:",
      err instanceof Error ? err.message : err,
    );
    return { allowed: true, remaining: limit - 1, resetAt };
  }
}

/** Build a 429 response from a rate-limit result (plain Response). */
export function rateLimited429(result: RateLimitResult): Response {
  const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  return new Response(
    JSON.stringify({
      error: `Rate limit exceeded. Try again in ${retryAfter}s.`,
      resetAt: result.resetAt,
    }),
    {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": String(retryAfter) },
    },
  );
}

/**
 * Trusted client IP from proxy headers.
 *
 * SECURITY: a client can send an arbitrary `X-Forwarded-For` header, so the
 * LEFTMOST XFF entry is attacker-controlled and must NOT be used for rate
 * limiting (an attacker rotates it to a fresh fake IP per request and the
 * per-IP limit never trips). On Vercel, `x-real-ip` and `x-vercel-forwarded-for`
 * are set by the platform to the true client IP and overwrite anything the
 * client sent, so we trust those first, then the RIGHTMOST XFF entry (appended
 * by the closest trusted proxy) — never the spoofable leftmost value.
 */
export function ipFromRequest(req: Request): string {
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const vercelFwd = req.headers.get("x-vercel-forwarded-for");
  if (vercelFwd) {
    const parts = vercelFwd.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }

  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }

  return "unknown";
}

/**
 * One-line durable per-IP rate limit for a route. Returns a ready-to-return
 * 429 `Response` when the caller is over the limit, or null to proceed.
 *
 *   const limited = await enforceIpLimit(req, "raise_dispute_ip");
 *   if (limited) return limited;
 */
export async function enforceIpLimit(
  req: Request,
  op: string,
): Promise<Response | null> {
  const { limit, windowMs } = getLimit(op);
  const rl = await rateLimitDurable(compoundKey({ op, ip: ipFromRequest(req) }), limit, windowMs);
  return rl.allowed ? null : rateLimited429(rl);
}
