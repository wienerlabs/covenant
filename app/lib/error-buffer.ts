/**
 * In-memory ring buffer of the most recent error log lines.
 *
 * Vercel's serverless functions are short-lived, so this buffer
 * only retains errors from a single function instance. That's
 * fine for "what just blew up?" debugging during a live demo —
 * the moment a request fails, the operator can hit
 * /api/admin/error-buffer and see the full structured error
 * without hunting through Vercel's log viewer.
 *
 * The buffer caps at 100 entries (ring) and drops the oldest
 * when full. Each entry is the same structured shape the
 * logger emits, plus a `recorded_at` timestamp.
 */

/**
 * Required + well-known fields callers (the structured logger, tests)
 * pass to `recordError`. The index signature lives on the wider
 * ErrorBufferEntry below, *not* here, because `Omit<T, K>` collapses
 * to the index signature alone when T has `[key: string]: any` —
 * which loses the required field check at the call site. Keeping
 * the input type free of an index signature preserves that check.
 */
export interface ErrorBufferInput {
  ts: string;
  level: string;
  msg: string;
  request_id?: string;
  route?: string;
  err_name?: string;
  err_message?: string;
  err_stack?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [extraKey: string]: any;
}

export interface ErrorBufferEntry extends ErrorBufferInput {
  recorded_at: string;
}

const MAX_ENTRIES = 100;

const globalForBuffer = globalThis as unknown as {
  covenantErrorBuffer: ErrorBufferEntry[] | undefined;
};

function getBuffer(): ErrorBufferEntry[] {
  if (!globalForBuffer.covenantErrorBuffer) {
    globalForBuffer.covenantErrorBuffer = [];
  }
  return globalForBuffer.covenantErrorBuffer;
}

/**
 * Push an error entry to the ring buffer. Should be called from
 * the structured logger only — direct calls from route handlers
 * are noisy.
 */
export function recordError(entry: ErrorBufferInput): void {
  const buf = getBuffer();
  // The spread of an index-signature type drops named-field info under TS
  // strict mode, so we cast at construction. `entry` is statically typed
  // as ErrorBufferInput which guarantees ts/level/msg at the call site.
  const full = {
    ...entry,
    recorded_at: new Date().toISOString(),
  } as ErrorBufferEntry;
  buf.push(full);
  while (buf.length > MAX_ENTRIES) buf.shift();
}

export function readErrorBuffer(): ErrorBufferEntry[] {
  return [...getBuffer()].reverse(); // newest first
}

export function clearErrorBuffer(): number {
  const buf = getBuffer();
  const n = buf.length;
  buf.length = 0;
  return n;
}

/** Buffer-side stats for the /api/admin/error-buffer GET response. */
export function bufferStats() {
  const buf = getBuffer();
  return {
    count: buf.length,
    capacity: MAX_ENTRIES,
    oldest: buf[0]?.recorded_at ?? null,
    newest: buf[buf.length - 1]?.recorded_at ?? null,
  };
}
