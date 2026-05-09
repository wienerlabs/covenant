/**
 * Webhook delivery — outbound event notifications.
 *
 * Posters and integration partners want to know when their jobs
 * change state without polling the API. The pattern other settlement
 * systems use (Stripe, Coinbase Commerce) is signed HTTP webhooks
 * with retries on failure. This module implements the same
 * primitives.
 *
 * Subscriptions are kept in a dedicated `WebhookSubscription`
 * table (added via ensureSchema migration). Each subscription
 * declares:
 *   - target URL (where to POST events)
 *   - filter (which event types to send)
 *   - secret (HMAC-SHA256 signing key)
 *   - retry policy (default: 5 attempts, exponential backoff)
 *
 * Events are sent as JSON with these headers:
 *   X-Covenant-Event:     job.created | job.accepted | job.delivered | ...
 *   X-Covenant-Signature: t=<unix>,v1=<hex hmac>
 *   X-Covenant-Delivery:  unique attempt id (for dedup on the receiver)
 *   Content-Type:         application/json
 *
 * Receivers verify by computing the HMAC of `t.body` with their
 * secret and comparing. Replay protection: timestamp must be within
 * 5 minutes of `now` (similar to Stripe's tolerance).
 */

import crypto from "node:crypto";

export type WebhookEventType =
  | "job.created"
  | "job.accepted"
  | "job.delivered"
  | "job.finalized"
  | "job.disputed"
  | "job.resolved"
  | "job.cancelled"
  | "claim.listed"
  | "claim.bought"
  | "claim.cancelled"
  | "claim.settled"
  | "battle.completed";

export interface WebhookEvent<T = Record<string, unknown>> {
  /** Stable identifier for this event. Receivers can dedup on this. */
  id: string;
  type: WebhookEventType;
  /** Unix epoch ms. */
  occurred_at: number;
  /** Event-specific payload. */
  data: T;
  /** Cluster the event happened on. */
  cluster: "devnet";
  /** Schema version, bumped if event shape changes. */
  v: 1;
}

export interface WebhookDeliveryAttempt {
  attempt: number;
  delivered_at: number;
  status_code?: number;
  ok: boolean;
  duration_ms: number;
  error?: string;
}

export interface WebhookDeliveryResult {
  event: WebhookEvent;
  url: string;
  attempts: WebhookDeliveryAttempt[];
  final_ok: boolean;
}

export interface WebhookSignOptions {
  /** HMAC secret. */
  secret: string;
  /** Defaults to Date.now() — override for deterministic tests. */
  timestampMs?: number;
}

/**
 * Build a signed `X-Covenant-Signature` header value for a given
 * payload. Format mirrors Stripe's: `t=<unix>,v1=<hex>`.
 *
 * The signed string is `${timestampMs}.${rawBody}` so a receiver
 * who only has the rendered text can verify without re-serializing.
 */
export function signWebhook(rawBody: string, opts: WebhookSignOptions): string {
  const ts = opts.timestampMs ?? Date.now();
  const payload = `${ts}.${rawBody}`;
  const mac = crypto.createHmac("sha256", opts.secret).update(payload).digest("hex");
  return `t=${ts},v1=${mac}`;
}

/**
 * Verify a signature header against a raw body + secret. Returns
 * `true` if valid AND within tolerance, `false` otherwise.
 *
 * Receivers should call this on every webhook delivery before
 * trusting the body.
 */
export function verifyWebhookSignature(args: {
  header: string | null | undefined;
  body: string;
  secret: string;
  toleranceMs?: number;
}): boolean {
  if (!args.header) return false;
  const tolerance = args.toleranceMs ?? 5 * 60_000;

  const parts = args.header.split(",").reduce<Record<string, string>>((acc, p) => {
    const [k, v] = p.split("=");
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {});
  const ts = Number(parts.t);
  const v1 = parts.v1;
  if (!ts || !v1) return false;
  if (Math.abs(Date.now() - ts) > tolerance) return false;

  const expected = crypto
    .createHmac("sha256", args.secret)
    .update(`${ts}.${args.body}`)
    .digest("hex");

  // Constant-time comparison to avoid timing attacks.
  if (expected.length !== v1.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(v1, "hex"));
}

/**
 * Generate a fresh event id. Format: `evt_<hex>`, ~14 chars.
 */
export function generateEventId(): string {
  return "evt_" + crypto.randomBytes(8).toString("hex");
}

/** Build a complete WebhookEvent for the given type + payload. */
export function buildEvent<T extends Record<string, unknown>>(
  type: WebhookEventType,
  data: T,
  opts?: { id?: string; occurred_at?: number },
): WebhookEvent<T> {
  return {
    id: opts?.id ?? generateEventId(),
    type,
    occurred_at: opts?.occurred_at ?? Date.now(),
    data,
    cluster: "devnet",
    v: 1,
  };
}

export interface DeliverOptions {
  url: string;
  secret: string;
  /** Per-attempt timeout in ms. Default 10s. */
  timeoutMs?: number;
  /** Max attempts (including the initial one). Default 5. */
  maxAttempts?: number;
  /** Override the global fetch (e.g. mock in tests). */
  fetch?: typeof globalThis.fetch;
  /** Override the sleep function (e.g. faster tests). */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * POST a single event to a single URL with HMAC signing and
 * exponential-backoff retry. Returns the full delivery record so
 * the caller can persist a webhook delivery log.
 *
 * Backoff: 1s, 5s, 25s, 125s (factor of 5, capped at maxAttempts).
 */
export async function deliverWebhook(
  event: WebhookEvent,
  opts: DeliverOptions,
): Promise<WebhookDeliveryResult> {
  const fetcher = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const timeout = opts.timeoutMs ?? 10_000;
  const maxAttempts = opts.maxAttempts ?? 5;
  const rawBody = JSON.stringify(event);
  const attempts: WebhookDeliveryAttempt[] = [];

  let finalOk = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      await sleep(Math.min(125_000, 1000 * Math.pow(5, attempt - 2)));
    }

    const signature = signWebhook(rawBody, { secret: opts.secret });
    const deliveryId = `${event.id}-${attempt}`;
    const t0 = Date.now();
    const controller = new AbortController();
    const tHandle = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetcher(opts.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Covenant-Event": event.type,
          "X-Covenant-Signature": signature,
          "X-Covenant-Delivery": deliveryId,
          "User-Agent": "covenant-webhooks/1.0",
        },
        body: rawBody,
        signal: controller.signal,
      });
      const duration = Date.now() - t0;
      const ok = res.status >= 200 && res.status < 300;
      attempts.push({
        attempt,
        delivered_at: Date.now(),
        status_code: res.status,
        ok,
        duration_ms: duration,
      });
      if (ok) {
        finalOk = true;
        break;
      }
      // 4xx (except 429) → don't retry. Receiver explicitly rejected.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        break;
      }
    } catch (err) {
      attempts.push({
        attempt,
        delivered_at: Date.now(),
        ok: false,
        duration_ms: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      clearTimeout(tHandle);
    }
  }

  return {
    event,
    url: opts.url,
    attempts,
    final_ok: finalOk,
  };
}
