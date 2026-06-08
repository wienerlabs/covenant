/**
 * C-006 — CI gate runner.
 *
 * Walks every API route under `app/app/api/**` and fails (exit 1) if any route
 * references a banned simulated-settlement primitive without an onchain guard.
 * Pure static scan — no build, no DB, no network.
 *
 *   npx tsx scripts/check-onchain-fakes.ts
 *
 * Wired into CI as the `fakes-gate` job in `.github/workflows/ci.yml`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { auditRoutes } from "../lib/fakes-gate";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = join(scriptDir, ".."); // app/
const apiRoot = join(appRoot, "app", "api"); // app/app/api

function walkRoutes(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkRoutes(full));
    else if (entry.name === "route.ts" || entry.name === "route.tsx") out.push(full);
  }
  return out;
}

const files = walkRoutes(apiRoot).map((path) => ({
  path: relative(appRoot, path),
  source: readFileSync(path, "utf8"),
}));

const scans = auditRoutes(files);
const violations = scans.filter((s) => s.violation);
const guarded = scans.length - violations.length;

console.log(
  `[fakes-gate] scanned ${files.length} route files · ${scans.length} reference a simulated primitive ` +
    `(${guarded} guarded, ${violations.length} unguarded).`,
);

if (violations.length > 0) {
  console.error(
    "\n[fakes-gate] ❌ Unguarded simulated settlement in onchain-flagged routes:\n",
  );
  for (const v of violations) {
    console.error(`  ${v.path}  → uses ${v.fakes.join(", ")} with no onchain guard`);
  }
  console.error(
    "\nEvery route that can reach a marker/simulated settlement must guard it so that\n" +
      "SETTLEMENT_MODE=onchain fails closed (C-002/C-003). Add blockSimulatedRouteIfOnchain(...)\n" +
      "at the top of the handler (or remove the fake and wire the real instruction).\n",
  );
  process.exit(1);
}

console.log("[fakes-gate] ✓ no unguarded simulated settlement paths.");
