/**
 * Unit tests for the C-006 fakes gate (lib/fakes-gate).
 *
 * Run with:  npx tsx --test tests/unit/fakes-gate.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import {
  scanRoute,
  auditRoutes,
  stripComments,
  BANNED_FAKE_CALLS,
  ONCHAIN_GUARDS,
} from "../../lib/fakes-gate";

const GUARDED_ROUTE = `
import { sendMarkerTransaction } from "@/lib/solana";
import { blockSimulatedRouteIfOnchain } from "@/lib/settlement";
export async function POST() {
  const blocked = blockSimulatedRouteIfOnchain("POST /api/jobs");
  if (blocked) return blocked;
  await sendMarkerTransaction("create_job:1");
}
`;

const UNGUARDED_ROUTE = `
import { sendMarkerTransaction } from "@/lib/solana";
export async function POST() {
  await sendMarkerTransaction("create_job:1");
}
`;

const CLEAN_ROUTE = `
import { prisma } from "@/lib/prisma";
export async function GET() {
  return Response.json(await prisma.job.findMany());
}
`;

const COMMENTED_FAKE_ROUTE = `
import { prisma } from "@/lib/prisma";
export async function POST() {
  // TODO: this used to call sendMarkerTransaction — now real on-chain.
  /* legacy: await sendMarkerTransaction("x"); */
  return Response.json({ ok: true });
}
`;

describe("scanRoute", () => {
  test("guarded route that uses a fake is NOT a violation", () => {
    const r = scanRoute("jobs/route.ts", GUARDED_ROUTE);
    assert.deepEqual(r.fakes, ["sendMarkerTransaction"]);
    assert.equal(r.guarded, true);
    assert.equal(r.violation, false);
  });

  test("unguarded route that uses a fake IS a violation", () => {
    const r = scanRoute("jobs/route.ts", UNGUARDED_ROUTE);
    assert.deepEqual(r.fakes, ["sendMarkerTransaction"]);
    assert.equal(r.guarded, false);
    assert.equal(r.violation, true);
  });

  test("a clean route references no fake and is not a violation", () => {
    const r = scanRoute("jobs/lookup/route.ts", CLEAN_ROUTE);
    assert.deepEqual(r.fakes, []);
    assert.equal(r.violation, false);
  });

  test("a fake only mentioned in comments is not counted", () => {
    const r = scanRoute("jobs/route.ts", COMMENTED_FAKE_ROUTE);
    assert.deepEqual(r.fakes, []);
    assert.equal(r.violation, false);
  });

  test("assertSimulatedAllowed also counts as a guard", () => {
    const src = `import { sendMarkerTransaction } from "x";
      assertSimulatedAllowed("sendMarkerTransaction");
      await sendMarkerTransaction("y");`;
    const r = scanRoute("solana.ts", src);
    assert.equal(r.guarded, true);
    assert.equal(r.violation, false);
  });
});

describe("stripComments", () => {
  test("removes line and block comments", () => {
    assert.equal(stripComments("a // b\nc").trim(), "a \nc".trim());
    assert.equal(stripComments("a /* b */ c").replace(/\s+/g, " ").trim(), "a c");
  });

  test("does not eat protocol-relative URLs (https://)", () => {
    assert.match(stripComments('const u = "https://x.com/y";'), /https:\/\/x\.com/);
  });
});

describe("auditRoutes", () => {
  test("returns only fake-referencing files; violations filter isolates the bad ones", () => {
    const scans = auditRoutes([
      { path: "guarded.ts", source: GUARDED_ROUTE },
      { path: "unguarded.ts", source: UNGUARDED_ROUTE },
      { path: "clean.ts", source: CLEAN_ROUTE },
    ]);
    assert.equal(scans.length, 2); // clean.ts excluded (no fake)
    const violations = scans.filter((s) => s.violation).map((s) => s.path);
    assert.deepEqual(violations, ["unguarded.ts"]);
  });

  test("BANNED_FAKE_CALLS and ONCHAIN_GUARDS are non-empty invariants", () => {
    assert.ok(BANNED_FAKE_CALLS.length > 0);
    assert.ok(ONCHAIN_GUARDS.includes("blockSimulatedRouteIfOnchain"));
  });
});

describe("real repository tree (regression: main stays green)", () => {
  test("no API route under app/app/api has an unguarded simulated path", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const appRoot = join(testDir, "..", ".."); // app/
    const apiRoot = join(appRoot, "app", "api");

    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, e.name);
        if (e.isDirectory()) out.push(...walk(full));
        else if (e.name === "route.ts" || e.name === "route.tsx") out.push(full);
      }
      return out;
    };

    const files = walk(apiRoot).map((path) => ({
      path: relative(appRoot, path),
      source: readFileSync(path, "utf8"),
    }));

    const violations = auditRoutes(files).filter((s) => s.violation);
    assert.deepEqual(
      violations.map((v) => v.path),
      [],
      `Unguarded simulated settlement found: ${violations
        .map((v) => `${v.path} (${v.fakes.join(",")})`)
        .join("; ")}`,
    );
  });
});
