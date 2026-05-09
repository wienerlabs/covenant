/**
 * Higher-order route handler wrappers.
 *
 * Reduce the per-route boilerplate. Every API route in the app
 * does some subset of:
 *   - log entry + exit with request_id, route, duration
 *   - call ensureSchema()
 *   - rate limit
 *   - validate body
 *   - convert thrown errors into structured envelope responses
 *
 * These helpers compose those concerns so a route can focus on
 * the actual business logic. Existing routes don't have to
 * migrate — adoption is opt-in.
 *
 * Usage:
 *
 *   export const GET = withInstrument(async (req, ctx) => {
 *     ctx.log.info("listing");
 *     const data = await retryable(() => prisma.job.findMany({ take: 10 }));
 *     return ok(data, { request_id: ctx.requestId });
 *   });
 *
 *   export const POST = withValidatedBody(
 *     {
 *       posterWallet: { type: "solanaPubkey", required: true },
 *       amount:       { type: "number", required: true, min: 0.01 },
 *     },
 *     async (req, parsed, ctx) => {
 *       ctx.log.info("creating", { wallet: parsed.posterWallet });
 *       const job = await retryable(() => createJob(parsed));
 *       return ok(job, { request_id: ctx.requestId, status: 201 });
 *     },
 *   );
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { log, generateRequestId } from "@/lib/logger";
import type { Logger } from "@/lib/logger";
import { fail, failFromError } from "@/lib/api-response";
import { parseAndValidate, validate } from "@/lib/validate";
import type { ValidationResult } from "@/lib/validate";
import { rateLimit, getLimit } from "@/lib/rateLimit";
import {
  parseIdempotencyKey,
  getCachedIdempotent,
  reserveIdempotent,
  recordIdempotent,
  releaseIdempotent,
} from "@/lib/idempotency";

export interface RouteContext {
  log: Logger;
  requestId: string;
  startedAt: number;
}

/** Wrap a handler with structured logging + automatic error envelope. */
export function withInstrument(
  handler: (req: NextRequest, ctx: RouteContext) => Promise<NextResponse>,
) {
  return async function instrumented(req: NextRequest): Promise<NextResponse> {
    const startedAt = Date.now();
    const reqLog = log.forRequest(req);
    const requestId =
      req.headers.get("x-request-id") ?? generateRequestId();

    try {
      const res = await handler(req, { log: reqLog, requestId, startedAt });
      reqLog.info("request ok", {
        duration_ms: Date.now() - startedAt,
        status: res.status,
      });
      return res;
    } catch (err) {
      reqLog.error("unhandled route error", err, {
        duration_ms: Date.now() - startedAt,
      });
      return failFromError(err);
    }
  };
}

/**
 * Wrap a handler with body parsing + validation. Calls the handler
 * only with a fully-typed `parsed` argument; on validation failure
 * automatically responds with a 400 invalid_input envelope.
 */
export function withValidatedBody<T extends Record<string, unknown>>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: Record<string, any>,
  handler: (req: NextRequest, parsed: T, ctx: RouteContext) => Promise<NextResponse>,
) {
  return withInstrument(async (req, ctx) => {
    const result: ValidationResult<T> = await parseAndValidate<T>(req, schema);
    if (!result.ok) {
      ctx.log.warn("validation failed", { issues: result.issues });
      return fail("invalid_input", "Validation failed.", {
        details: { issues: result.issues },
        request_id: ctx.requestId,
      });
    }
    return handler(req, result.data, ctx);
  });
}

/**
 * Wrap a handler with rate limiting keyed on either the wallet
 * field of the body (preferred) or the request IP. Looks up the
 * limit from the central LIMIT_TABLE so cluster + op tuning lives
 * in one place.
 */
export function withRateLimit(
  op: string,
  keyExtractor: (req: NextRequest) => string,
  handler: (req: NextRequest, ctx: RouteContext) => Promise<NextResponse>,
) {
  return withInstrument(async (req, ctx) => {
    const { limit, windowMs } = getLimit(op);
    const key = `${op}:${keyExtractor(req)}`;
    const rl = rateLimit(key, limit, windowMs);
    if (!rl.allowed) {
      const retryAfter = Math.ceil((rl.resetAt - Date.now()) / 1000);
      ctx.log.warn("rate limited", { op, key, retryAfter });
      return fail("rate_limited", `Too many requests. Try again in ${retryAfter}s.`, {
        request_id: ctx.requestId,
        details: { retryAfter, limit, windowMs },
        headers: { "Retry-After": String(retryAfter) },
      });
    }
    return handler(req, ctx);
  });
}

/**
 * Compose validation + rate limit + idempotency + instrumentation
 * in one call. Reads the rate-limit key from a body field
 * (default `wallet`).
 *
 * `idempotent: true` makes the handler honor the Idempotency-Key
 * header — replays inside the 60s window get the cached response.
 */
export function route<T extends Record<string, unknown>>(args: {
  op: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: Record<string, any>;
  rateLimitKey?: keyof T;
  idempotent?: boolean;
  idempotencyTtlMs?: number;
  handler: (req: NextRequest, parsed: T, ctx: RouteContext) => Promise<NextResponse>;
}) {
  const inner = async (req: NextRequest, ctx: RouteContext): Promise<NextResponse> => {
    const result = await parseAndValidate<T>(req, args.schema);
    if (!result.ok) {
      return fail("invalid_input", "Validation failed.", {
        details: { issues: result.issues },
        request_id: ctx.requestId,
      });
    }
    const data = result.data;

    const { limit, windowMs } = getLimit(args.op);
    const keyField = args.rateLimitKey ?? ("wallet" as keyof T);
    const keyValue =
      (data[keyField] as string | undefined) ??
      req.headers.get("x-forwarded-for") ??
      "anonymous";
    const rl = rateLimit(`${args.op}:${keyValue}`, limit, windowMs);
    if (!rl.allowed) {
      const retryAfter = Math.ceil((rl.resetAt - Date.now()) / 1000);
      return fail("rate_limited", `Too many requests. Try again in ${retryAfter}s.`, {
        request_id: ctx.requestId,
        details: { retryAfter, limit, windowMs },
        headers: { "Retry-After": String(retryAfter) },
      });
    }

    return args.handler(req, data, ctx);
  };

  if (args.idempotent) {
    return withIdempotency(inner, args.idempotencyTtlMs);
  }
  return withInstrument(inner);
}

/**
 * Wrap a handler with idempotency-key support. Replays of the same
 * `Idempotency-Key` header within the TTL window get the cached
 * response byte-identical to the first one.
 *
 * Use on POST endpoints where a double-submit would create real
 * harm (job creation, claim purchases, finalize calls). Reads
 * are unaffected.
 */
export function withIdempotency(
  handler: (req: NextRequest, ctx: RouteContext) => Promise<NextResponse>,
  ttlMs?: number,
) {
  return withInstrument(async (req, ctx) => {
    const key = parseIdempotencyKey(req);
    if (!key) {
      // No idempotency key supplied — treat as a normal request.
      return handler(req, ctx);
    }

    // Check for an existing cached response (or wait for in-flight).
    const hit = await getCachedIdempotent(key);
    if (hit) {
      ctx.log.info("idempotent replay served", { idempotency_key: key });
      // Re-wrap the cached Response into a NextResponse for type
      // consistency. The body stream is replayable on the cloned
      // record so we read it once.
      const body = await hit.response.text();
      const headers: Record<string, string> = {};
      hit.response.headers.forEach((v, k) => {
        headers[k] = v;
      });
      return new NextResponse(body, {
        status: hit.response.status,
        headers,
      });
    }

    // Reserve the slot so concurrent replays wait on us.
    const reserved = reserveIdempotent(key, ttlMs);
    if (!reserved) {
      // Another caller raced us — fall back to waiting for their result.
      const second = await getCachedIdempotent(key);
      if (second) {
        const body = await second.response.text();
        const headers: Record<string, string> = {};
        second.response.headers.forEach((v, k) => {
          headers[k] = v;
        });
        return new NextResponse(body, {
          status: second.response.status,
          headers,
        });
      }
      // Couldn't reserve and couldn't read — release and fall
      // through, accepting the rare double-execution risk.
      releaseIdempotent(key);
    }

    let res: NextResponse;
    try {
      res = await handler(req, ctx);
    } catch (err) {
      releaseIdempotent(key);
      throw err;
    }

    // Cache the final response for replays. We do this even on
    // 4xx/5xx so a retry doesn't blindly re-attempt a known-bad
    // request — saves on rate limits and confused users.
    try {
      await recordIdempotent(key, res, ttlMs);
    } catch {
      releaseIdempotent(key);
    }
    return res;
  });
}

/** Tiny helper to validate a body without HTTP context (e.g. inside a webhook). */
export function validateBody<T extends Record<string, unknown>>(
  body: unknown,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: Record<string, any>,
): ValidationResult<T> {
  return validate<T>(body, schema);
}
