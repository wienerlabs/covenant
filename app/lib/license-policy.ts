/**
 * C-107 — license compliance policy (pure, testable).
 *
 * The project is licensed LGPL-2.1 (see ../LICENSE). This module decides, for a
 * given dependency license string, whether it is permissive (auto-OK), a known
 * non-permissive license we have explicitly assessed, or an unknown license
 * that must block CI until a human resolves it. The I/O (reading node_modules,
 * emitting Markdown, the CI gate) lives in `scripts/license-inventory.ts`.
 */

/** SPDX identifiers accepted without review (permissive, LGPL-compatible). */
export const PERMISSIVE = new Set([
  "MIT",
  "MIT-0",
  "ISC",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "Unlicense",
  "CC0-1.0",
  "BlueOak-1.0.0",
  "Python-2.0",
]);

export interface Assessment {
  /** "cleared" = confirmed permissive-equivalent; "review" = non-permissive,
   *  tracked pending legal sign-off (warns, does not block CI). */
  status: "cleared" | "review";
  note: string;
}

/**
 * Direct deps whose `license` field is not a clean permissive SPDX id but has
 * been assessed by hand. Keep the reason with each entry.
 */
export const ASSESSED: Record<string, Assessment> = {
  "@walletconnect/universal-provider": {
    status: "review",
    note:
      "Reown 'WalletConnect Community License' (custom, non-OSI). Used for " +
      "wallet connection. Legal must confirm redistribution is compatible with " +
      "the project's LGPL-2.1 before mainnet launch.",
  },
};

/**
 * True if the license string is permissive: a known SPDX id, or an SPDX
 * OR-expression with at least one permissive operand (e.g. "(MIT OR Apache-2.0)").
 */
export function permissiveSpdx(license: string): boolean {
  if (PERMISSIVE.has(license)) return true;
  const operands = license
    .replace(/[()]/g, "")
    .split(/\s+OR\s+/i)
    .map((s) => s.trim());
  return operands.length > 1 && operands.some((o) => PERMISSIVE.has(o));
}

export type LicenseStatus = "ok" | "review" | "fail";

/** Classify a dependency's license into ok / review / fail. */
export function classify(
  name: string,
  license: string,
): { status: LicenseStatus; note?: string } {
  if (permissiveSpdx(license)) return { status: "ok" };
  const assessed = ASSESSED[name];
  if (assessed) {
    return {
      status: assessed.status === "cleared" ? "ok" : "review",
      note: assessed.note,
    };
  }
  return { status: "fail" };
}
