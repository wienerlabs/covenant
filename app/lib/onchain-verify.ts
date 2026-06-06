/**
 * On-chain verification + reconciliation (M1).
 *
 * Pure decision functions: given an already-fetched on-chain `JobEscrow`
 * view plus the values a request claims, decide whether to trust the request.
 * No RPC, no Prisma — the route fetches the escrow (via lib/program-server)
 * and passes it here, so this logic is fully unit-testable without a chain.
 *
 *   - C-011: checkCreateJob  — escrow holds the stated amount + mint, the PDA
 *            derived from [b"job", poster, spec_hash] matches, poster matches.
 *   - C-012b: checkAcceptJob — on-chain taker == submitter and status Accepted.
 *   - C-021: reconcileJobRow — compute the DB fields that drifted from chain.
 */

/** The subset of an on-chain JobEscrow these checks read (see program-server). */
export interface EscrowView {
  poster: string;
  taker: string;
  tokenMint: string;
  /** Human-unit amount (informational). */
  amount: number;
  /** Atomic amount — authoritative for the under-funded check. */
  amountAtomic: bigint;
  specHashHex: string;
  status: string;
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

/** Solana's all-zero pubkey, used by the program for "no taker yet". */
export const SYSTEM_ZERO_PUBKEY = "11111111111111111111111111111111";

/* ------------------------------------------------------------------ */
/*  C-011 — create_job verification                                    */
/* ------------------------------------------------------------------ */

export interface CreateJobExpectation {
  poster: string;
  specHashHex: string;
  /** Minimum atomic amount the escrow must hold (reject under-funding). */
  minAmountAtomic: bigint;
  /** Required token mint (USDC). */
  mint: string;
}

/**
 * Verify a confirmed `create_job` escrow matches what the request claims
 * (C-011). The caller must separately confirm the tx invoked our program
 * (`verifyTxInvokedCovenant`) and that the escrow was fetched at the PDA
 * derived from `[b"job", poster, spec_hash]`.
 */
export function checkCreateJob(
  escrow: EscrowView | null,
  expect: CreateJobExpectation,
): VerifyResult {
  if (!escrow) {
    return { ok: false, reason: "JobEscrow PDA not found after the tx confirmed" };
  }
  if (escrow.poster !== expect.poster) {
    return {
      ok: false,
      reason: `escrow poster mismatch (on-chain ${escrow.poster} vs claimed ${expect.poster})`,
    };
  }
  if (escrow.specHashHex !== expect.specHashHex) {
    return { ok: false, reason: "escrow spec_hash does not match the submitted spec" };
  }
  if (escrow.tokenMint !== expect.mint) {
    return {
      ok: false,
      reason: `escrow holds the wrong mint (${escrow.tokenMint}, expected USDC ${expect.mint})`,
    };
  }
  if (escrow.amountAtomic < expect.minAmountAtomic) {
    return {
      ok: false,
      reason: `under-funded escrow: holds ${escrow.amountAtomic}, requires ${expect.minAmountAtomic}`,
    };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/*  C-012b — accept_job verification                                   */
/* ------------------------------------------------------------------ */

/**
 * Verify an on-chain `accept_job` bound the submitter as taker (C-012b).
 * Mirror to the DB only when this returns ok.
 */
export function checkAcceptJob(
  escrow: EscrowView | null,
  submitter: string,
): VerifyResult {
  if (!escrow) {
    return { ok: false, reason: "JobEscrow not found on chain" };
  }
  if (escrow.taker !== submitter) {
    return {
      ok: false,
      reason: `on-chain taker (${escrow.taker}) does not match submitter (${submitter})`,
    };
  }
  if (escrow.status !== "Accepted") {
    return {
      ok: false,
      reason: `on-chain status is '${escrow.status}', expected 'Accepted'`,
    };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/*  C-021 — DB ↔ chain reconciliation                                  */
/* ------------------------------------------------------------------ */

export interface JobRowView {
  status: string;
  takerWallet: string | null;
  amount: number;
}

export interface JobRowRepair {
  status?: string;
  takerWallet?: string;
  amount?: number;
}

export interface ReconcileResult {
  drifted: boolean;
  /** The DB fields to overwrite from chain (empty when in sync). */
  updates: JobRowRepair;
}

/**
 * Compute how a DB Job row has drifted from its on-chain JobEscrow, treating
 * the chain as the source of truth (C-021). Returns the fields to overwrite;
 * applying them heals a corrupted/stale mirror.
 */
export function reconcileJobRow(
  db: JobRowView,
  escrow: EscrowView,
): ReconcileResult {
  const updates: JobRowRepair = {};

  if (escrow.status && escrow.status !== "Unknown" && db.status !== escrow.status) {
    updates.status = escrow.status;
  }

  const chainTaker =
    escrow.taker && escrow.taker !== SYSTEM_ZERO_PUBKEY ? escrow.taker : null;
  if (chainTaker && db.takerWallet !== chainTaker) {
    updates.takerWallet = chainTaker;
  }

  if (
    Number.isFinite(escrow.amount) &&
    Math.abs(db.amount - escrow.amount) > 1e-6
  ) {
    updates.amount = escrow.amount;
  }

  return { drifted: Object.keys(updates).length > 0, updates };
}
