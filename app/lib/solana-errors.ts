/**
 * Solana failure-mode classifier (C-023).
 *
 * Every signed on-chain flow can fail in a handful of well-known ways. This
 * maps a raw error (from web3.js / Anchor / the RPC) to a stable category, a
 * user-facing message, and whether a retry could help — so routes return a
 * clear error instead of a 500 stack, and callers can decide to retry vs
 * surface. Pure + synchronous; the per-mode behavior is unit-tested.
 *
 * Pair with the "verify before you write" rule: classify the failure and
 * return *before* any DB mutation, so a failed tx never half-commits the DB.
 */

export type SolanaFailureMode =
  | "blockhash_expired"
  | "insufficient_sol"
  | "ata_not_found"
  | "simulation_failed"
  | "rate_limited"
  | "tx_reverted"
  | "unknown";

export interface ClassifiedSolanaError {
  mode: SolanaFailureMode;
  /** Safe, user-facing message. */
  message: string;
  /** Whether retrying the same operation could succeed. */
  retryable: boolean;
}

function errorText(err: unknown): string {
  if (err == null) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) {
    // Anchor/web3 errors often stash detail in `.logs`.
    const logs = (err as { logs?: unknown }).logs;
    const logStr = Array.isArray(logs) ? " " + logs.join(" ") : "";
    return `${err.name}: ${err.message}${logStr}`;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * Classify a Solana error into one of the known failure modes (C-023).
 * Order matters: more specific patterns are tested before generic ones.
 */
export function classifySolanaError(err: unknown): ClassifiedSolanaError {
  const text = errorText(err).toLowerCase();

  // RPC rate limiting — almost always transient.
  if (
    text.includes("429") ||
    text.includes("too many requests") ||
    text.includes("rate limit") ||
    text.includes("rate-limit")
  ) {
    return {
      mode: "rate_limited",
      message: "The network is busy (RPC rate limit). Please try again in a moment.",
      retryable: true,
    };
  }

  // Blockhash expired — the tx wasn't landed in time; rebuild + resend.
  if (
    text.includes("blockhash not found") ||
    text.includes("blockhashnotfound") ||
    text.includes("block height exceeded") ||
    text.includes("blockheightexceeded") ||
    text.includes("transactionexpired")
  ) {
    return {
      mode: "blockhash_expired",
      message: "The transaction expired before it landed. Please retry.",
      retryable: true,
    };
  }

  // Missing associated token account.
  if (
    text.includes("tokenaccountnotfound") ||
    text.includes("could not find account") ||
    text.includes("account does not exist") ||
    text.includes("associated token account")
  ) {
    return {
      mode: "ata_not_found",
      message: "A required token account is missing. Create your USDC account and retry.",
      retryable: false,
    };
  }

  // Insufficient SOL for fees / rent. ("Attempt to debit an account but found
  // no record of a prior credit" is the canonical fee-payer-has-no-SOL error.)
  if (
    text.includes("insufficient lamports") ||
    text.includes("insufficient funds for rent") ||
    text.includes("insufficient funds for fee") ||
    text.includes("attempt to debit an account but found no record")
  ) {
    return {
      mode: "insufficient_sol",
      message: "Not enough SOL to pay network fees. Fund the wallet and retry.",
      retryable: false,
    };
  }

  // Generic simulation failure (constraint violations, program errors).
  if (
    text.includes("transaction simulation failed") ||
    text.includes("simulation failed") ||
    text.includes("sendtransactionerror")
  ) {
    return {
      mode: "simulation_failed",
      message: "The transaction failed simulation and was not sent. No changes were made.",
      retryable: false,
    };
  }

  // Tx landed but reverted on chain.
  if (
    text.includes("reverted") ||
    text.includes("instructionerror") ||
    text.includes("custom program error")
  ) {
    return {
      mode: "tx_reverted",
      message: "The transaction was rejected on chain. No changes were made.",
      retryable: false,
    };
  }

  return {
    mode: "unknown",
    message: "An unexpected on-chain error occurred. No changes were made.",
    retryable: false,
  };
}
