/**
 * Compute-budget + priority-fee instructions for lifecycle txs (C-025).
 *
 * Under network load a transaction with the default compute budget and no
 * priority fee can fail to land. Prepending a `SetComputeUnitLimit` +
 * `SetComputeUnitPrice` pair raises the odds the tx confirms during
 * congestion — important on mainnet. Tunable via env so ops can react to
 * fee markets without a redeploy.
 */

import { ComputeBudgetProgram, type TransactionInstruction } from "@solana/web3.js";

/** Default per-tx compute-unit ceiling — generous for our lifecycle ixs. */
export const DEFAULT_COMPUTE_UNIT_LIMIT = 200_000;
/** Default priority fee in micro-lamports per compute unit. */
export const DEFAULT_PRIORITY_FEE_MICROLAMPORTS = 1_000;

/** Compute-unit limit from `COMPUTE_UNIT_LIMIT`, else the default. */
export function computeUnitLimit(): number {
  const v = Number(process.env.COMPUTE_UNIT_LIMIT);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : DEFAULT_COMPUTE_UNIT_LIMIT;
}

/** Priority fee (micro-lamports/CU) from `PRIORITY_FEE_MICROLAMPORTS`, else default. */
export function priorityFeeMicroLamports(): number {
  const v = Number(process.env.PRIORITY_FEE_MICROLAMPORTS);
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : DEFAULT_PRIORITY_FEE_MICROLAMPORTS;
}

/**
 * Build the `[SetComputeUnitLimit, SetComputeUnitPrice]` instructions to
 * prepend (via `.preInstructions(...)`) to a lifecycle transaction so it
 * lands under load (C-025).
 */
export function computeBudgetInstructions(opts?: {
  units?: number;
  microLamports?: number;
}): TransactionInstruction[] {
  const units = opts?.units ?? computeUnitLimit();
  const microLamports = opts?.microLamports ?? priorityFeeMicroLamports();
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
  ];
}
