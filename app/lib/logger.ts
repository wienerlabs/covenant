/**
 * Structured logger with request-correlated IDs.
 *
 * Designed for serverless (Vercel) where every function invocation
 * is its own process and the only durable observability surface is
 * the JSON line emitted to stdout. We standardize that line shape
 * so log aggregators (Vercel Logs, Datadog, BetterStack, etc.) can
 * filter by level, request_id, route, and component without
 * resorting to free-text grep.
 *
 * Usage:
 *
 *   import { log } from "@/lib/logger";
 *
 *   log.info("create-job request", { wallet, amount });
 *   log.warn("anthropic credit fallback", { route: "arena/run" });
 *   log.error("prisma cold start", err, { route: "jobs" });
 *
 *   // Inside an API handler:
 *   const requestLog = log.forRequest(req);
 *   requestLog.info("accepted", { jobId });
 *
 * Output format (one JSON object per line):
 *
 *   {
 *     "ts": "2026-05-01T09:31:14.823Z",
 *     "level": "info",
 *     "msg": "create-job request",
 *     "request_id": "req_8f2c1e",
 *     "route": "/api/jobs",
 *     "wallet": "7Gp...",
 *     "amount": 5
 *   }
 */

import type { NextRequest } from "next/server";
import { recordError } from "@/lib/error-buffer";

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

const MIN_LEVEL: number =
  LEVELS[(process.env.LOG_LEVEL as LogLevel) || "info"] ?? LEVELS.info;

/** Generate a short, URL-safe request ID. ~14 chars, ~6e15 entropy. */
export function generateRequestId(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 8; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return (
    "req_" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

interface LogFields {
  [key: string]: unknown;
}

interface BaseLogger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, err?: unknown, fields?: LogFields): void;
  fatal(msg: string, err?: unknown, fields?: LogFields): void;
}

export interface Logger extends BaseLogger {
  /** Bind fields to a child logger that inherits + adds context. */
  child(fields: LogFields): Logger;
  /** Bind a Next.js request — extracts route, method, request_id. */
  forRequest(req: NextRequest | Request): Logger;
}

function emit(level: LogLevel, msg: string, fields: LogFields): void {
  if (LEVELS[level] < MIN_LEVEL) return;
  const line: LogFields = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...fields,
  };
  // Use the matching console method so Vercel Logs colorizes correctly.
  const target =
    level === "error" || level === "fatal"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log;
  // Single-line JSON keeps each log entry parseable.
  try {
    target(JSON.stringify(line));
  } catch {
    // Circular reference fallback — strip non-serializable fields.
    target(
      JSON.stringify({
        ts: line.ts,
        level,
        msg,
        warning: "log fields contained non-serializable values",
      }),
    );
  }

  // Mirror error/fatal lines into the in-memory ring buffer so
  // /api/admin/error-buffer can show the most recent failures
  // without operator access to Vercel Logs.
  if (level === "error" || level === "fatal") {
    try {
      recordError(line as Parameters<typeof recordError>[0]);
    } catch {
      /* swallow */
    }
  }
}

function serializeError(err: unknown): LogFields {
  if (err instanceof Error) {
    return {
      err_name: err.name,
      err_message: err.message,
      err_stack: err.stack?.split("\n").slice(0, 8).join("\n"),
    };
  }
  return { err_message: String(err) };
}

function makeLogger(boundFields: LogFields = {}): Logger {
  const merge = (extra?: LogFields): LogFields =>
    extra ? { ...boundFields, ...extra } : boundFields;

  return {
    debug: (msg, fields) => emit("debug", msg, merge(fields)),
    info: (msg, fields) => emit("info", msg, merge(fields)),
    warn: (msg, fields) => emit("warn", msg, merge(fields)),
    error: (msg, err, fields) =>
      emit("error", msg, merge({ ...(err ? serializeError(err) : {}), ...fields })),
    fatal: (msg, err, fields) =>
      emit("fatal", msg, merge({ ...(err ? serializeError(err) : {}), ...fields })),
    child: (fields) => makeLogger({ ...boundFields, ...fields }),
    forRequest: (req) => {
      const url = new URL(req.url);
      const requestId =
        req.headers.get("x-request-id") ||
        req.headers.get("x-vercel-id") ||
        generateRequestId();
      return makeLogger({
        ...boundFields,
        request_id: requestId,
        method: req.method,
        route: url.pathname,
      });
    },
  };
}

export const log: Logger = makeLogger();

/**
 * Time an async function and emit a `duration_ms` field. Useful for
 * spotting slow Prisma queries or RPC calls without introducing an
 * APM dependency.
 *
 *   const result = await timed(log, "fetch jobs", () => prisma.job.findMany());
 */
export async function timed<T>(
  logger: Logger,
  label: string,
  fn: () => Promise<T>,
  fields?: LogFields,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    logger.info(`${label} ok`, { duration_ms: Date.now() - start, ...fields });
    return result;
  } catch (err) {
    logger.error(`${label} failed`, err, {
      duration_ms: Date.now() - start,
      ...fields,
    });
    throw err;
  }
}
