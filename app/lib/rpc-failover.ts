/**
 * Multi-RPC failover Connection wrapper, with exponential backoff and an
 * optional rate budget (C-064).
 *
 * Solana web3.js's `Connection` is bound to a single endpoint. When that
 * endpoint rate-limits (429) or 5xx's mid-flow, the whole call fails. This
 * wraps `Connection` in a Proxy that, on a retryable error, **backs off** then
 * rotates to the next URL in the chain and retries. A `429`/rate-limit error
 * backs off harder than a transient network blip.
 *
 * To respect a provider's plan limits, set `RPC_RATE_BUDGET_PER_SEC` — outgoing
 * calls are then throttled through a token bucket so we proactively stay under
 * the cap instead of waiting to be 429'd. Unset = no throttle (default).
 *
 * For server code (Anchor program calls, etc.) prefer this over
 * `new Connection(getRpcUrl())` directly.
 */

import { Connection } from "@solana/web3.js";
import type { Commitment } from "@solana/web3.js";
import { RPC_CHAIN } from "@/lib/network";

const RETRYABLE = [
  /429/,
  /rate.?limit/i,
  /timeout/i,
  /etimedout/i,
  /econnreset/i,
  /econnrefused/i,
  /503/,
  /502/,
  /504/,
  /failed to fetch/i,
];

/** Errors that specifically indicate provider rate limiting (back off harder). */
const RATE_LIMITED = [/429/, /rate.?limit/i, /too many requests/i];

function msgOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** True for transient errors worth retrying against another endpoint. */
export function isRetryable(err: unknown): boolean {
  const msg = msgOf(err);
  return RETRYABLE.some((re) => re.test(msg));
}

/** True when the error is a 429 / rate-limit (vs a generic transient failure). */
export function isRateLimited(err: unknown): boolean {
  const msg = msgOf(err);
  return RATE_LIMITED.some((re) => re.test(msg));
}

/**
 * Exponential backoff with full jitter. `attempt` is 0-based. Rate-limited
 * errors start from a higher base so we genuinely yield the provider's window.
 * Pure (inject `rand` for deterministic tests).
 */
export function backoffDelayMs(
  attempt: number,
  opts?: {
    baseMs?: number;
    maxMs?: number;
    rateLimited?: boolean;
    rand?: () => number;
  },
): number {
  const baseMs = opts?.baseMs ?? 250;
  const maxMs = opts?.maxMs ?? 8000;
  const base = opts?.rateLimited ? baseMs * 4 : baseMs;
  const uncapped = base * 2 ** Math.max(0, attempt);
  const ceil = Math.min(maxMs, uncapped);
  const rand = opts?.rand ?? Math.random;
  // Full jitter in [50%, 100%] of the ceiling — avoids thundering-herd retries.
  return Math.floor(ceil * (0.5 + 0.5 * rand()));
}

/**
 * Token-bucket rate budget — proactively keep RPC calls under a provider's
 * per-second plan limit. Pure + injectable clock for tests.
 */
export class RpcRateBudget {
  private tokens: number;
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private last: number;
  private readonly now: () => number;

  constructor(opts: { ratePerSec: number; burst?: number; now?: () => number }) {
    this.capacity = Math.max(1, opts.burst ?? opts.ratePerSec);
    this.tokens = this.capacity;
    this.refillPerMs = opts.ratePerSec / 1000;
    this.now = opts.now ?? Date.now;
    this.last = this.now();
  }

  private refill(): void {
    const t = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + (t - this.last) * this.refillPerMs);
    this.last = t;
  }

  /** Take a token if available without waiting. */
  tryTake(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /** Ms until the next token is available (0 if one is available now). */
  msUntilToken(): number {
    this.refill();
    if (this.tokens >= 1) return 0;
    return Math.ceil((1 - this.tokens) / this.refillPerMs);
  }
}

/**
 * Run `invoke` with retry-on-rotate + backoff. Pure: all side effects (rotating
 * the endpoint, sleeping) are injected, so the loop is unit-testable.
 */
export async function callWithFailover<T>(
  invoke: () => Promise<T>,
  deps: {
    maxAttempts: number;
    isRetryable: (e: unknown) => boolean;
    delayFor: (attempt: number, err: unknown) => number;
    sleep: (ms: number) => Promise<void>;
    onRetry: (attempt: number, err: unknown) => void;
  },
): Promise<T> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < deps.maxAttempts; attempt++) {
    try {
      return await invoke();
    } catch (err) {
      lastErr = err;
      if (!deps.isRetryable(err)) throw err;
      if (attempt < deps.maxAttempts - 1) {
        await deps.sleep(deps.delayFor(attempt, err));
        deps.onRetry(attempt, err);
      }
    }
  }
  throw lastErr;
}

const sleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();

interface FailoverState {
  cursor: number;
  conn: Connection;
  chain: string[];
  budget: RpcRateBudget | null;
}

let _state: FailoverState | null = null;

function makeBudget(): RpcRateBudget | null {
  const perSec = Number(process.env.RPC_RATE_BUDGET_PER_SEC);
  if (!Number.isFinite(perSec) || perSec <= 0) return null;
  return new RpcRateBudget({ ratePerSec: perSec });
}

function getState(commitment: Commitment): FailoverState {
  if (!_state) {
    const chain = RPC_CHAIN.length > 0 ? RPC_CHAIN : ["https://api.devnet.solana.com"];
    _state = {
      cursor: 0,
      chain,
      conn: new Connection(chain[0], commitment),
      budget: makeBudget(),
    };
  }
  return _state;
}

function rotate(commitment: Commitment): void {
  if (!_state) return;
  _state.cursor = (_state.cursor + 1) % _state.chain.length;
  _state.conn = new Connection(_state.chain[_state.cursor], commitment);
  // eslint-disable-next-line no-console
  console.warn(
    `[rpc-failover] rotated to ${_state.chain[_state.cursor]} (cursor=${_state.cursor})`,
  );
}

/**
 * Returns a `Connection`-shaped proxy that throttles to the rate budget (if
 * configured) and auto-fails over with backoff across the RPC chain.
 *
 *   const conn = createFailoverConnection("confirmed");
 *   await conn.getLatestBlockhash();
 */
export function createFailoverConnection(commitment: Commitment = "confirmed"): Connection {
  const state = getState(commitment);

  return new Proxy(state.conn, {
    get(_target, prop, _receiver) {
      const orig = Reflect.get(state.conn, prop);
      if (typeof orig !== "function") return orig;

      return (...args: unknown[]) =>
        callWithFailover(
          async () => {
            // Respect the provider's plan limit before each call.
            if (state.budget) {
              const wait = state.budget.msUntilToken();
              if (wait > 0) await sleep(wait);
              state.budget.tryTake();
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fn = (state.conn as any)[prop] as (...a: unknown[]) => unknown;
            return await Promise.resolve(fn.apply(state.conn, args));
          },
          {
            maxAttempts: state.chain.length,
            isRetryable,
            delayFor: (attempt, err) =>
              backoffDelayMs(attempt, { rateLimited: isRateLimited(err) }),
            sleep,
            onRetry: (attempt, err) => {
              // eslint-disable-next-line no-console
              console.warn(
                `[rpc-failover] ${String(prop)} failed on ${state.chain[state.cursor]} ` +
                  `(attempt ${attempt + 1}), backing off + rotating:`,
                msgOf(err),
              );
              rotate(commitment);
            },
          },
        );
    },
  });
}

/** Reset the cached failover state — primarily for tests. */
export function resetFailoverState(): void {
  _state = null;
}
