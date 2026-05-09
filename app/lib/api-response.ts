/**
 * Standard API response envelope.
 *
 * Existing routes return inconsistent shapes — some `{ jobs, total }`,
 * some `[]` directly, some `{ error }` wrappers. New routes should
 * use these helpers so the public API surface is predictable for
 * SDK consumers and OpenAPI generation has a stable contract to
 * describe.
 *
 * The envelope is:
 *
 *   ok success:   { ok: true,  data: T,                meta?: {...}, request_id }
 *   error:        { ok: false, error: { code, message, details? }, request_id }
 *
 * `code` is a stable machine-readable string ("rate_limited",
 * "invalid_input", "db_unavailable", ...). `message` is a short
 * human-readable explanation. `details` carries Zod validation
 * paths or other structured context the client may want to surface.
 *
 * The legacy graceful-fail shape `{ data: [], dbHealthy: false }`
 * remains valid for now and the new envelope is opt-in via these
 * helpers, so we don't have to migrate every route at once.
 */

import { NextResponse } from "next/server";
import { generateRequestId } from "@/lib/logger";

export type ApiErrorCode =
  | "invalid_input"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "db_unavailable"
  | "rpc_unavailable"
  | "wallet_signature_failed"
  | "internal_error";

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  meta?: Record<string, unknown>;
  request_id: string;
}

export interface ApiError {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
  request_id: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

const CODE_TO_HTTP: Record<ApiErrorCode, number> = {
  invalid_input: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  db_unavailable: 503,
  rpc_unavailable: 503,
  wallet_signature_failed: 400,
  internal_error: 500,
};

/** Wrap a successful payload in the standard envelope. */
export function ok<T>(
  data: T,
  opts?: {
    meta?: Record<string, unknown>;
    request_id?: string;
    headers?: Record<string, string>;
    status?: number;
  },
): NextResponse {
  const body: ApiSuccess<T> = {
    ok: true,
    data,
    ...(opts?.meta ? { meta: opts.meta } : {}),
    request_id: opts?.request_id ?? generateRequestId(),
  };
  return NextResponse.json(body, {
    status: opts?.status ?? 200,
    headers: { "x-request-id": body.request_id, ...(opts?.headers ?? {}) },
  });
}

/** Wrap an error in the standard envelope and pick the HTTP status from the code. */
export function fail(
  code: ApiErrorCode,
  message: string,
  opts?: {
    details?: Record<string, unknown>;
    request_id?: string;
    headers?: Record<string, string>;
    /** Override the default HTTP status mapped from `code`. */
    status?: number;
  },
): NextResponse {
  const body: ApiError = {
    ok: false,
    error: {
      code,
      message,
      ...(opts?.details ? { details: opts.details } : {}),
    },
    request_id: opts?.request_id ?? generateRequestId(),
  };
  return NextResponse.json(body, {
    status: opts?.status ?? CODE_TO_HTTP[code],
    headers: { "x-request-id": body.request_id, ...(opts?.headers ?? {}) },
  });
}

/**
 * Convert an unknown thrown value into a fail() response. Pattern-
 * matches common error families (Prisma, Zod, generic) so callers
 * can do `try { ... } catch (err) { return failFromError(err); }`
 * and get a sensible code+message without writing a giant switch.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function failFromError(err: unknown, fallbackCode: ApiErrorCode = "internal_error"): NextResponse {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = err as any;
  const message: string = e?.message ?? String(err);

  // Prisma client error patterns
  if (typeof message === "string") {
    if (/can't reach database|connection terminated|EAI_AGAIN/i.test(message)) {
      return fail("db_unavailable", "Database temporarily unavailable, please retry.", {
        details: { hint: message.slice(0, 200) },
      });
    }
    if (/relation.*does not exist|column.*does not exist/i.test(message)) {
      return fail("db_unavailable", "Database schema is migrating, please retry.", {
        details: { hint: message.slice(0, 200) },
      });
    }
    if (/Unique constraint failed|duplicate key value/i.test(message)) {
      return fail("conflict", "Resource already exists.", {
        details: { hint: message.slice(0, 200) },
      });
    }
  }

  // Zod ZodError carries .issues[]
  if (Array.isArray(e?.issues)) {
    return fail("invalid_input", "Validation failed.", {
      details: { issues: e.issues },
    });
  }

  return fail(fallbackCode, message.slice(0, 300));
}
