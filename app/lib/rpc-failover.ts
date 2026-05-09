/**
 * Multi-RPC failover Connection wrapper.
 *
 * Solana web3.js's `Connection` is bound to a single endpoint. When
 * that endpoint rate-limits or 5xx's mid-flow, the whole call fails.
 * For demo reliability we want automatic retry against a chain of
 * fallback RPC URLs.
 *
 * `createFailoverConnection()` returns a Proxy around `Connection`
 * that intercepts every method call. On a thrown error matching
 * "rate limit" / "429" / network-level failure, it rotates to the
 * next URL in the chain and retries. The current healthy URL sticks
 * across calls until it fails.
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

function isRetryable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return RETRYABLE.some((re) => re.test(msg));
}

interface FailoverState {
  /** Index of the URL currently in use. */
  cursor: number;
  /** Cached Connection for the current URL. */
  conn: Connection;
  chain: string[];
}

let _state: FailoverState | null = null;

function getState(commitment: Commitment): FailoverState {
  if (!_state) {
    const chain = RPC_CHAIN.length > 0 ? RPC_CHAIN : ["https://api.devnet.solana.com"];
    _state = {
      cursor: 0,
      chain,
      conn: new Connection(chain[0], commitment),
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
 * Returns a `Connection`-shaped proxy that auto-fails over across
 * the configured RPC chain.
 *
 * Usage:
 *   const conn = createFailoverConnection("confirmed");
 *   await conn.getLatestBlockhash();
 */
export function createFailoverConnection(commitment: Commitment = "confirmed"): Connection {
  const state = getState(commitment);

  return new Proxy(state.conn, {
    get(_target, prop, _receiver) {
      const orig = Reflect.get(state.conn, prop);
      if (typeof orig !== "function") return orig;

      // Wrap method call with retry-on-rotate semantics.
      return async (...args: unknown[]) => {
        const maxAttempts = state.chain.length;
        let lastErr: unknown = null;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fn = (state.conn as any)[prop] as (...a: unknown[]) => unknown;
            const result = fn.apply(state.conn, args);
            // If it returns a promise, await + catch
            if (result && typeof (result as Promise<unknown>).then === "function") {
              return await (result as Promise<unknown>);
            }
            return result;
          } catch (err) {
            lastErr = err;
            if (!isRetryable(err)) throw err;
            // eslint-disable-next-line no-console
            console.warn(
              `[rpc-failover] ${String(prop)} failed on ${state.chain[state.cursor]}, rotating:`,
              err instanceof Error ? err.message : String(err),
            );
            rotate(commitment);
          }
        }
        throw lastErr;
      };
    },
  });
}

/** Reset the cached failover state — primarily for tests. */
export function resetFailoverState(): void {
  _state = null;
}
