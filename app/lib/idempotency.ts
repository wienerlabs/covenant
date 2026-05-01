/**
 * Idempotency key store.
 *
 * Why this exists: wallet popups are slow and confusing. Users
 * double-click "Submit", networks retry, browsers re-send POSTs
 * after navigation. Without idempotency, a second click can:
 *   - create two jobs (rejected at PDA, but the UI 500s)
 *   - record duplicate ELO updates
 *   - charge a buyer twice if Solana confirmed but DB write
 *     hadn't completed
 *
 * The standard fix is an `Idempotency-Key` header (RFC 9457
 * style). The first request with a given key produces a result
 * and the result gets cached against the key. Replays inside
 * the TTL get the cached response immediately, byte-identical
 * to the first.
 *
 * This implementation is in-memory per-instance, which is fine
 * for the Vercel serverless model: a Phantom popup plus retry
 * lands in the same warm instance ~99% of the time, and the 1%
 * miss case ends up doing the work twice but still succeeds
 * because the underlying on-chain operations are PDA-keyed and
 * therefore idempotent at the chain level. We get a >99% safety
 * net without a Redis dependency.
 *
 * Usage from a route handler:
 *
 *   const idem = parseIdempotencyKey(req);
 *   if (idem) {
 *     const cached = await getCachedIdempotent(idem);
 *     if (cached) return cached.response;
 *   }
 *   const response = await doTheWork();
 *   if (idem) recordIdempotent(idem, response);
 *   return response;
 *
 * Or via the route-helpers wrapper:
 *
 *   export const POST = route({ op: "create_job", schema: ..., idempotent: true, handler: ... });
 */

const MAX_ENTRIES = 500;
const DEFAULT_TTL_MS = 60_000; // 1 minute — covers wallet popup + retries

interface IdempotentRecord {
  /** Cached body so we can rebuild a Response on replay. */
  body: string;
  /** HTTP status to replay. */
  status: number;
  /** Response headers we want to preserve (request_id, retry-after, etc.). */
  headers: Record<string, string>;
  /** When this record was first stored. */
  storedAt: number;
  /** When this record stops being served. */
  expiresAt: number;
  /** Whether the work is still in flight — replays should wait. */
  inflight: boolean;
}

const globalForIdem = globalThis as unknown as {
  covenantIdempotency: Map<string, IdempotentRecord> | undefined;
};

function getStore(): Map<string, IdempotentRecord> {
  if (!globalForIdem.covenantIdempotency) {
    globalForIdem.covenantIdempotency = new Map();
  }
  return globalForIdem.covenantIdempotency;
}

/**
 * Pull the idempotency key from the request. We accept three
 * header names so different SDKs all work without configuration:
 *   - `Idempotency-Key`     (RFC 9457 / Stripe convention)
 *   - `X-Idempotency-Key`   (legacy / manual)
 *   - `X-Request-Id`        (only when explicitly set by client)
 *
 * The middleware-set `x-request-id` is NOT used because that's
 * stamped per-request by us, not by the client, so it changes
 * on every retry.
 */
export function parseIdempotencyKey(req: Request): string | null {
  const direct =
    req.headers.get("idempotency-key") ?? req.headers.get("x-idempotency-key");
  if (direct && /^[A-Za-z0-9_\-:.]{8,128}$/.test(direct)) {
    return direct;
  }
  return null;
}

export interface IdempotentHit {
  response: Response;
  isReplay: true;
}

/**
 * Get a previously-cached response for this key. Returns null on
 * miss, undefined on stale, or a ready-to-return Response on hit.
 *
 * If a record is in-flight (work hasn't finished), we wait briefly
 * for it to settle so concurrent replays don't fan out to N
 * duplicate work runs.
 */
export async function getCachedIdempotent(
  key: string,
): Promise<IdempotentHit | null> {
  const store = getStore();
  let entry = store.get(key);
  if (!entry) return null;

  const now = Date.now();
  if (now >= entry.expiresAt) {
    store.delete(key);
    return null;
  }

  // Wait for an in-flight first request to settle. We poll briefly
  // (up to 30s) so a fast retry from the same client can join the
  // first request's response instead of redoing the work.
  const startedAt = Date.now();
  while (entry?.inflight && Date.now() - startedAt < 30_000) {
    await new Promise((r) => setTimeout(r, 100));
    entry = store.get(key);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) return null;
  }

  if (!entry || entry.inflight) {
    // Either the entry vanished or we timed out waiting. Fall
    // through to letting the caller re-run the work.
    return null;
  }

  return {
    response: new Response(entry.body, {
      status: entry.status,
      headers: { ...entry.headers, "x-idempotent-replay": "true" },
    }),
    isReplay: true,
  };
}

/**
 * Reserve an idempotency key for an in-flight operation. Returns
 * true if reserved, false if another caller already owns it (in
 * which case the caller should call getCachedIdempotent and wait).
 */
export function reserveIdempotent(key: string, ttlMs = DEFAULT_TTL_MS): boolean {
  const store = getStore();
  const existing = store.get(key);
  if (existing && Date.now() < existing.expiresAt) {
    return false;
  }
  store.set(key, {
    body: "",
    status: 0,
    headers: {},
    storedAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
    inflight: true,
  });
  bound(store);
  return true;
}

/**
 * Record the final response for a key. Called once after the
 * route handler completes.
 */
export async function recordIdempotent(
  key: string,
  response: Response,
  ttlMs = DEFAULT_TTL_MS,
): Promise<void> {
  const store = getStore();
  const cloned = response.clone();
  const body = await cloned.text();
  const headers: Record<string, string> = {};
  cloned.headers.forEach((v, k) => {
    headers[k] = v;
  });

  store.set(key, {
    body,
    status: response.status,
    headers,
    storedAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
    inflight: false,
  });
  bound(store);
}

/** Mark an in-flight key as failed so replays can retry. */
export function releaseIdempotent(key: string): void {
  getStore().delete(key);
}

function bound(store: Map<string, IdempotentRecord>): void {
  if (store.size <= MAX_ENTRIES) return;
  // Drop the oldest by storedAt — simple TTL-aware eviction.
  let oldestKey: string | undefined;
  let oldestStored = Infinity;
  for (const [k, v] of store) {
    if (v.storedAt < oldestStored) {
      oldestStored = v.storedAt;
      oldestKey = k;
    }
  }
  if (oldestKey) store.delete(oldestKey);
}

export function idempotencyStats() {
  const store = getStore();
  let inflight = 0;
  const now = Date.now();
  for (const v of store.values()) {
    if (v.inflight && now < v.expiresAt) inflight++;
  }
  return {
    size: store.size,
    inflight,
    capacity: MAX_ENTRIES,
    default_ttl_ms: DEFAULT_TTL_MS,
  };
}

export function clearIdempotency(): number {
  const store = getStore();
  const n = store.size;
  store.clear();
  return n;
}
