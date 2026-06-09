/**
 * C-122 — retry with exponential backoff for flaky RPC.
 *
 * Pure + injectable (sleep, jitter source) so the backoff schedule and the
 * retry/give-up behaviour are unit-testable without real timers or a network.
 */

import { isRetriableError } from "./errors";

export interface RetryOptions {
  /** Extra attempts after the first try (default 3 → up to 4 total). */
  maxRetries: number;
  /** First backoff step in ms (default 250). */
  baseDelayMs: number;
  /** Upper bound on a single backoff step in ms (default 4000). */
  maxDelayMs: number;
  /** Apply full jitter to each delay (default true). */
  jitter: boolean;
  /** Decide whether a given error is retriable (default isRetriableError). */
  shouldRetry?: (err: unknown) => boolean;
  /** Injectable sleep (tests). */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable jitter source in [0,1) (tests). */
  random?: () => number;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 250,
  maxDelayMs: 4000,
  jitter: true,
};

/** Exponential backoff (base * 2^attempt) capped at maxDelayMs, with optional full jitter. */
export function backoffDelayMs(attempt: number, opts?: Partial<RetryOptions>): number {
  const base = opts?.baseDelayMs ?? DEFAULT_RETRY_OPTIONS.baseDelayMs;
  const max = opts?.maxDelayMs ?? DEFAULT_RETRY_OPTIONS.maxDelayMs;
  const jitter = opts?.jitter ?? DEFAULT_RETRY_OPTIONS.jitter;
  const random = opts?.random ?? Math.random;
  const capped = Math.min(max, base * 2 ** attempt);
  return jitter ? Math.floor(random() * capped) : capped;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run `fn`, retrying retriable errors with exponential backoff. Rethrows the
 * last (raw) error once retries are exhausted or on a non-retriable error.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts?: Partial<RetryOptions>): Promise<T> {
  const maxRetries = opts?.maxRetries ?? DEFAULT_RETRY_OPTIONS.maxRetries;
  const shouldRetry = opts?.shouldRetry ?? isRetriableError;
  const sleep = opts?.sleep ?? defaultSleep;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= maxRetries || !shouldRetry(err)) break;
      await sleep(backoffDelayMs(attempt, opts));
    }
  }
  throw lastErr;
}
