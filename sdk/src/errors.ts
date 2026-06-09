/**
 * C-122 — typed SDK errors.
 *
 * Every failure surfaced by the client is one of these, so callers can branch
 * on the kind (retriable RPC blip vs. on-chain program rejection vs. bad input)
 * instead of string-matching `Error.message`.
 */

export class CovenantError extends Error {
  /** The original thrown value, preserved for debugging. */
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "CovenantError";
    this.cause = cause;
  }
}

/** Transient RPC / network failure (timeout, 429, stale blockhash). Safe to retry. */
export class CovenantRpcError extends CovenantError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "CovenantRpcError";
  }
}

/** The on-chain program rejected the instruction. A logic failure — NOT retriable. */
export class CovenantProgramError extends CovenantError {
  readonly code?: number | string;
  readonly logs?: string[];
  constructor(message: string, opts?: { code?: number | string; logs?: string[]; cause?: unknown }) {
    super(message, opts?.cause);
    this.name = "CovenantProgramError";
    this.code = opts?.code;
    this.logs = opts?.logs;
  }
}

/** Client-side validation failure (bad params, account decode mismatch). NOT retriable. */
export class CovenantValidationError extends CovenantError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "CovenantValidationError";
  }
}

const RETRIABLE_PATTERNS: RegExp[] = [
  /blockhash not found/i,
  /node is behind/i,
  /too many requests/i,
  /\b429\b/,
  /\b50[234]\b/, // 502 / 503 / 504
  /timed?\s*out/i,
  /timeout/i,
  /fetch failed/i,
  /econnreset/i,
  /etimedout/i,
  /enotfound/i,
  /socket hang ?up/i,
  /network (request )?failed/i,
  /failed to query long-term storage/i,
];
// NOTE: "Transaction was not confirmed" is deliberately NOT retriable. It means
// the tx was sent and confirmation polling timed out — the tx has very likely
// landed, so auto-resending it would be a double-send. The caller should
// reconcile against on-chain state instead. (Reads, which are idempotent, are
// always safe to retry; sends rely on on-chain idempotency as the backstop.)

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function extractAnchorCode(err: unknown): number | string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as any;
  if (e.error?.errorCode?.code !== undefined) return e.error.errorCode.code;
  if (e.error?.errorCode?.number !== undefined) return e.error.errorCode.number;
  if (typeof e.code === "number") return e.code;
  const custom = e.transactionError?.InstructionError?.[1]?.Custom;
  if (typeof custom === "number") return custom;
  return undefined;
}

function extractLogs(err: unknown): string[] | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as any;
  if (Array.isArray(e.logs)) return e.logs;
  if (Array.isArray(e.transactionLogs)) return e.transactionLogs;
  return undefined;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** True for transient RPC/network errors that are safe to retry. */
export function isRetriableError(err: unknown): boolean {
  if (err instanceof CovenantRpcError) return true;
  if (err instanceof CovenantProgramError || err instanceof CovenantValidationError) return false;
  // A classified program error embedded as a cause is never retriable.
  if (extractAnchorCode(err) !== undefined) return false;
  return RETRIABLE_PATTERNS.some((re) => re.test(messageOf(err)));
}

/** Map a raw thrown value into a typed CovenantError. Idempotent. */
export function classifyError(err: unknown): CovenantError {
  if (err instanceof CovenantError) return err;
  const msg = messageOf(err);

  const code = extractAnchorCode(err);
  if (code !== undefined) {
    return new CovenantProgramError(msg, { code, logs: extractLogs(err), cause: err });
  }
  if (isRetriableError(err)) {
    return new CovenantRpcError(msg, err);
  }
  return new CovenantError(msg, err);
}
