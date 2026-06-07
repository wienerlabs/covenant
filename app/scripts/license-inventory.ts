/**
 * C-107 — third-party license inventory + compliance gate (I/O runner).
 *
 * Reads the *direct* dependencies declared in `app/package.json`, resolves each
 * installed package's license from `node_modules`, and classifies it with the
 * pure policy in `../lib/license-policy`. The project itself is LGPL-2.1 (see
 * ../LICENSE); this keeps an auditable record that no dependency carries an
 * incompatible or unknown license, and surfaces any that still need sign-off.
 *
 *   npx tsx scripts/license-inventory.ts          # print the Markdown inventory
 *   npx tsx scripts/license-inventory.ts --check   # CI gate: exit 1 only on an
 *                                                   # UNKNOWN/unassessed runtime
 *                                                   # license (review items warn)
 *
 * devDependencies are reported but do not gate the build — they are tooling and
 * are not redistributed in the deployed app.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { classify, type LicenseStatus } from "../lib/license-policy";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(appRoot, "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

interface Row {
  name: string;
  license: string;
  kind: "runtime" | "dev";
  status: LicenseStatus;
  note?: string;
}

function licenseOf(name: string): string {
  try {
    const m = JSON.parse(
      readFileSync(join(appRoot, "node_modules", name, "package.json"), "utf8"),
    );
    if (typeof m.license === "string") return m.license;
    if (m.license?.type) return m.license.type;
    if (Array.isArray(m.licenses)) {
      return m.licenses.map((l: { type?: string }) => l.type || l).join(" OR ");
    }
    return "UNKNOWN";
  } catch {
    return "NOT-INSTALLED";
  }
}

function buildRows(): Row[] {
  const rows: Row[] = [];
  const add = (name: string, kind: "runtime" | "dev") => {
    const license = licenseOf(name);
    rows.push({ name, license, kind, ...classify(name, license) });
  };
  for (const name of Object.keys(pkg.dependencies ?? {})) add(name, "runtime");
  for (const name of Object.keys(pkg.devDependencies ?? {})) add(name, "dev");
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

const rows = buildRows();

if (process.argv.includes("--check")) {
  const runtime = rows.filter((r) => r.kind === "runtime");
  const failed = runtime.filter((r) => r.status === "fail");
  const review = runtime.filter((r) => r.status === "review");

  for (const r of review) {
    console.warn(`[license-gate] ⚠️  review-required: ${r.name} (${r.license}) — ${r.note}`);
  }
  if (failed.length > 0) {
    console.error("\n[license-gate] ❌ runtime deps with an UNKNOWN / unassessed license:");
    for (const b of failed) console.error(`  ${b.name}: ${b.license}`);
    console.error(
      "\nResolve each: confirm the license and add it to ASSESSED in\n" +
        "lib/license-policy.ts (status 'cleared' or 'review'), or replace the dep.\n",
    );
    process.exit(1);
  }
  console.log(
    `[license-gate] ✓ ${runtime.length} runtime deps: all licensed` +
      (review.length ? ` (${review.length} flagged for legal review — see above)` : "") +
      ".",
  );
} else {
  const icon: Record<LicenseStatus, string> = {
    ok: "✓",
    review: "⚠️ review",
    fail: "❌ unknown",
  };
  const dist: Record<string, number> = {};
  for (const r of rows) dist[r.license] = (dist[r.license] || 0) + 1;
  console.log("| Package | License | Scope | Status |");
  console.log("|---------|---------|-------|--------|");
  for (const r of rows) {
    console.log(`| \`${r.name}\` | ${r.license} | ${r.kind} | ${icon[r.status]} |`);
  }
  console.log(
    "\n**Summary:** " +
      Object.entries(dist)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${v}× ${k}`)
        .join(", "),
  );
  const review = rows.filter((r) => r.status === "review");
  if (review.length) {
    console.log("\n**Requires legal review before mainnet:**");
    for (const r of review) console.log(`- \`${r.name}\` — ${r.note}`);
  }
}
