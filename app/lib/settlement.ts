/**
 * Settlement mode flag (C-003).
 *
 * `SETTLEMENT_MODE` decides whether simulated settlement paths (the marker
 * self-transfer, demo record-only jobs, …) are allowed:
 *
 *   - "simulated" (default) — the devnet demo behavior; fakes are permitted.
 *   - "onchain"             — fakes are disabled and must throw, so a
 *                             still-faked route fails loudly instead of
 *                             silently pretending it settled on chain.
 *
 * This is intentionally NARROW: it does NOT touch cluster selection
 * (`COVENANT_ENV`/mainnet), which is deliberately devnet-locked elsewhere.
 * It only governs simulated-vs-real settlement.
 */

export type SettlementMode = "simulated" | "onchain";
export type CovenantEnv = "devnet" | "mainnet";

/** Current settlement mode; defaults to "simulated". */
export function settlementMode(): SettlementMode {
  return process.env.SETTLEMENT_MODE === "onchain" ? "onchain" : "simulated";
}

/**
 * Declared deployment cluster (C-002). Defaults to "devnet". This is a flag
 * only — the app is still devnet-locked at the cluster level (`lib/network.ts`);
 * real mainnet support is gated behind the M4 cluster work (C-060+).
 */
export function covenantEnv(): CovenantEnv {
  return process.env.COVENANT_ENV === "mainnet" ? "mainnet" : "devnet";
}

/** Whether real on-chain settlement is required (no fakes allowed). */
export function isOnchainMode(): boolean {
  return settlementMode() === "onchain";
}

/**
 * Guard a simulated/fake settlement path. In `onchain` mode this throws so
 * the fake can never run; in `simulated` mode it is a no-op.
 *
 *   assertSimulatedAllowed("sendMarkerTransaction");
 */
export function assertSimulatedAllowed(what: string): void {
  if (isOnchainMode()) {
    throw new Error(
      `${what} is a simulated settlement path and is disabled when ` +
        `SETTLEMENT_MODE=onchain. Use the real on-chain instruction instead.`,
    );
  }
}

/**
 * Route-level guard for endpoints whose settlement is still simulated (they
 * call the marker transaction). In `onchain` mode this returns a ready-to-
 * return **501** so the route fails honestly instead of faking success
 * (C-002); in `simulated` mode it returns null and the route proceeds.
 *
 *   const blocked = blockSimulatedRouteIfOnchain("POST /api/jobs");
 *   if (blocked) return blocked;
 */
export function blockSimulatedRouteIfOnchain(routeName: string): Response | null {
  if (!isOnchainMode()) return null;
  return new Response(
    JSON.stringify({
      error:
        `${routeName} is not yet wired for real on-chain settlement and is ` +
        `disabled while SETTLEMENT_MODE=onchain.`,
      code: "simulated_path_disabled",
    }),
    { status: 501, headers: { "Content-Type": "application/json" } },
  );
}
