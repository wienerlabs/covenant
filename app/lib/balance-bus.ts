"use client";

/**
 * Lightweight pub/sub for wallet balance refreshes.
 *
 * The NavBar's WalletBalance component subscribes here and refetches
 * on every emit. Any code path that moves USDC or SOL from the user's
 * wallet (CreateJobForm, DisputeModal, SubmitWorkModal) calls
 * `triggerBalanceRefresh()` after its transaction confirms, so the
 * balance updates instantly instead of waiting for the 10-second
 * background poll.
 *
 * Module-scoped state — one bus per page load. No external store
 * dependency, works in React strict mode because the subscribe
 * callback is stable and the set is deduplicated.
 */

type BalanceListener = () => void;

const listeners = new Set<BalanceListener>();

/**
 * Subscribe to balance refresh events. Returns an unsubscribe function.
 * Safe to call from a useEffect cleanup.
 */
export function onBalanceRefresh(listener: BalanceListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Notify every subscriber that the wallet balance should be refetched.
 * Call this after any confirmed transaction that moves value into or
 * out of the connected wallet.
 *
 * Safe to call on the server — becomes a no-op if no listeners exist.
 */
export function triggerBalanceRefresh(): void {
  // Small microtask delay so the transaction has a moment to propagate
  // to the RPC node's view of the account before we refetch.
  setTimeout(() => {
    for (const listener of listeners) {
      try {
        listener();
      } catch (err) {
        // Swallow listener errors — one failing consumer must not block others
        console.error("[balance-bus] listener error:", err);
      }
    }
  }, 250);
}
