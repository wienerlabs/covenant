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

export interface ErrorBufferEntry {
  recorded_at: string;
  ts: string;
  level: string;
  msg: string;
  request_id?: string;
  route?: string;
  err_name?: string;
  err_message?: string;
  err_stack?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
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
export function recordError(entry: Omit<ErrorBufferEntry, "recorded_at">): void {
  const buf = getBuffer();
  buf.push({ recorded_at: new Date().toISOString(), ...entry });
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
