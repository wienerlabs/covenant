/**
 * Precise USDC <-> atomic-units conversion.
 *
 * USDC has 6 decimals on Solana. The naive `Math.round(amount * 1e6)`
 * pattern produces float rounding errors at scale:
 *
 *   Math.round(0.1 * 1e6)   = 100000   ✓
 *   Math.round(0.001 * 1e6) = 1000     ✓
 *   Math.round(123.456789 * 1e6) = 123456789   ✓
 *   Math.round(0.01234567 * 1e6) = 12346    ← lost a digit + rounded up
 *
 * For mainnet money handling we want explicit string-based parsing
 * so partial-cent amounts round predictably and very-small or
 * very-large amounts don't lose precision via Number coercion.
 *
 * BN-based output keeps the value safe for Anchor BN math and for
 * SPL token instructions which take u64 atomic units.
 */

import { BN } from "@coral-xyz/anchor";
import { USDC_DECIMALS } from "@/lib/network";

/** Convert a human USDC amount (e.g. 12.34) to atomic units (BN). */
export function usdcToAtomic(amount: number | string): BN {
  return tokensToAtomic(amount, USDC_DECIMALS);
}

/** Convert atomic USDC units (BN | bigint | number) back to a human number. */
export function usdcFromAtomic(atomic: BN | bigint | number): number {
  return tokensFromAtomic(atomic, USDC_DECIMALS);
}

/**
 * Generic decimals-aware conversion. Parses the human amount as a
 * string, splits on `.`, pads/truncates the fractional part to
 * `decimals` digits, then concatenates as a BN.
 *
 * Throws if the amount is negative, has more than `decimals`
 * fractional digits (lossy truncation), or is not a finite number.
 */
export function tokensToAtomic(amount: number | string, decimals: number): BN {
  if (typeof amount === "number") {
    if (!Number.isFinite(amount)) {
      throw new Error(`tokensToAtomic: amount is not finite (${amount})`);
    }
    if (amount < 0) {
      throw new Error(`tokensToAtomic: negative amount (${amount})`);
    }
    // Use toFixed to render precisely up to `decimals` digits.
    amount = amount.toFixed(decimals);
  } else {
    if (!/^-?\d+(\.\d+)?$/.test(amount)) {
      throw new Error(`tokensToAtomic: malformed amount "${amount}"`);
    }
    if (amount.startsWith("-")) {
      throw new Error(`tokensToAtomic: negative amount "${amount}"`);
    }
  }

  const [intPart, fracRaw = ""] = amount.split(".");
  if (fracRaw.length > decimals) {
    // Truncating any digits past `decimals` would silently lose
    // precision — refuse instead so callers must round first.
    throw new Error(
      `tokensToAtomic: amount "${amount}" has more than ${decimals} fractional digits`,
    );
  }
  const frac = fracRaw.padEnd(decimals, "0");
  // Strip leading zeros to keep BN parser happy with empty intPart edge case.
  const combined = (intPart || "0") + frac;
  return new BN(combined.replace(/^0+(?=\d)/, "") || "0");
}

/** Atomic-units (BN | bigint | number) → human float. */
export function tokensFromAtomic(
  atomic: BN | bigint | number,
  decimals: number,
): number {
  let s: string;
  if (atomic instanceof BN) s = atomic.toString();
  else if (typeof atomic === "bigint") s = atomic.toString();
  else s = String(Math.round(atomic));

  const padded = s.padStart(decimals + 1, "0");
  const intPart = padded.slice(0, padded.length - decimals);
  const fracPart = padded.slice(padded.length - decimals);
  return Number(`${intPart}.${fracPart}`);
}

/**
 * Round a human amount to the token's max precision. Useful in UI
 * where the user might paste 12.34567890 and we want 12.345678
 * before passing to tokensToAtomic.
 */
export function roundToTokenPrecision(amount: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(amount * factor) / factor;
}
