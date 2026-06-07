/**
 * C-006 — fakes gate (static analysis).
 *
 * Locks in the C-002 / C-003 invariant: every API route that can reach a
 * *simulated* settlement primitive — the marker self-transfer
 * (`sendMarkerTransaction`) and friends — must guard it so that under
 * `SETTLEMENT_MODE=onchain` the fake can never run. A route that references a
 * banned primitive WITHOUT an onchain guard is a reintroduced, reachable fake,
 * and CI must fail on it (see `scripts/check-onchain-fakes.ts`).
 *
 * This is intentionally a dependency-free *text* scan, not a type-level or
 * runtime check: it must run as a fast CI gate with no build and no DB. It
 * trades a little precision (it matches identifiers, not resolved symbols) for
 * being impossible to break and trivial to reason about.
 *
 * It does NOT ban the primitives outright — the routes legitimately keep the
 * simulated path for `SETTLEMENT_MODE=simulated` (the devnet demo) until the
 * real on-chain instructions land (M1: C-014/C-019). What it forbids is using
 * one *without* the fail-closed guard.
 */

/**
 * Simulated-settlement primitives that must never execute in onchain mode.
 * Extend this as new fakes are identified (keep in sync with
 * `docs/SIMULATION_INVENTORY.md`).
 */
export const BANNED_FAKE_CALLS = ["sendMarkerTransaction"] as const;

/**
 * Guards that make a simulated path fail closed in onchain mode (C-002/C-003):
 *   - `blockSimulatedRouteIfOnchain(...)` → returns a 501 at the route top.
 *   - `assertSimulatedAllowed(...)`       → throws inside the primitive.
 * A route carrying either is considered protected.
 */
export const ONCHAIN_GUARDS = [
  "blockSimulatedRouteIfOnchain",
  "assertSimulatedAllowed",
] as const;

export interface RouteScan {
  /** Display path of the scanned file. */
  path: string;
  /** Banned primitives referenced by this file (after stripping comments). */
  fakes: string[];
  /** Whether the file carries at least one onchain guard. */
  guarded: boolean;
  /** True when the file references a fake but is not guarded → a violation. */
  violation: boolean;
}

/**
 * Remove block and line comments so a commented-out or TODO reference
 * (`// replace sendMarkerTransaction`) is never counted as a live call.
 * Deliberately conservative: the `[^:]` lookbehind avoids eating `https://`.
 */
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const wordRe = (name: string) => new RegExp(`\\b${name}\\b`);

/** Scan a single route's source for unguarded simulated-settlement usage. */
export function scanRoute(path: string, source: string): RouteScan {
  const code = stripComments(source);
  const fakes = BANNED_FAKE_CALLS.filter((name) => wordRe(name).test(code));
  const guarded = ONCHAIN_GUARDS.some((g) => wordRe(g).test(code));
  return {
    path,
    fakes: [...fakes],
    guarded,
    violation: fakes.length > 0 && !guarded,
  };
}

/**
 * Audit a set of route files. Returns only the files that reference a banned
 * primitive (guarded or not) so callers can report both; filter on
 * `.violation` for the failing set.
 */
export function auditRoutes(
  files: { path: string; source: string }[],
): RouteScan[] {
  return files
    .map((f) => scanRoute(f.path, f.source))
    .filter((r) => r.fakes.length > 0);
}
