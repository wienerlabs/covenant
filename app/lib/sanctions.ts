/**
 * C-105 — geographic / sanctions screening hook.
 *
 * Screens a wallet address against an OFAC-derived denylist before it can take
 * a value-bearing action (post a job, etc.). Per the stance in
 * `docs/SANCTIONS.md`, a sanctioned wallet is **blocked**.
 *
 * The denylist is **operator-loaded** — the OFAC SDN list changes, so we do NOT
 * ship a fabricated list. It is the union of:
 *   - `lib/sanctions-list.json` (`addresses`), populated from the OFAC feed, and
 *   - the `SANCTIONS_DENYLIST` env var (comma-separated) — lets ops add/update
 *     entries without a deploy.
 *
 * Pure + dependency-free → unit-testable and safe to import anywhere.
 */

import bundled from "./sanctions-list.json";

export interface SanctionsResult {
  blocked: boolean;
  /** Safe-to-surface reason when blocked. */
  reason?: string;
}

const BLOCK_REASON =
  "This wallet is on a sanctions (OFAC) list and cannot transact on Covenant. " +
  "See docs/SANCTIONS.md.";

/** The active denylist: bundled OFAC addresses ∪ SANCTIONS_DENYLIST env. */
export function sanctionsDenylist(): Set<string> {
  const fromFile = Array.isArray((bundled as { addresses?: unknown }).addresses)
    ? ((bundled as { addresses: string[] }).addresses)
    : [];
  const fromEnv = (process.env.SANCTIONS_DENYLIST ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set([...fromFile, ...fromEnv].map((a) => a.trim()).filter(Boolean));
}

/** True if `wallet` is on the sanctions denylist (exact base58 match). */
export function isSanctioned(wallet: string | null | undefined): boolean {
  if (!wallet || typeof wallet !== "string") return false;
  return sanctionsDenylist().has(wallet.trim());
}

/**
 * Screen a wallet at an on-ramp action. Returns `{ blocked: true, reason }`
 * for a sanctioned wallet (reject with HTTP 403), else `{ blocked: false }`.
 */
export function screenWallet(wallet: string | null | undefined): SanctionsResult {
  return isSanctioned(wallet) ? { blocked: true, reason: BLOCK_REASON } : { blocked: false };
}
