/**
 * Unit tests for the C-105 sanctions screening hook (lib/sanctions).
 *
 * The bundled OFAC list ships empty (operator-loaded), so we drive the hook via
 * the SANCTIONS_DENYLIST env to verify the screening MECHANISM with fixtures.
 *
 * Run with:  npx tsx --test tests/unit/sanctions.test.ts
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { isSanctioned, screenWallet, sanctionsDenylist } from "../../lib/sanctions";

const BAD = "SanctionedWa11et1111111111111111111111111111";
const GOOD = "CleanWa11et22222222222222222222222222222222";

describe("C-105 · sanctions screening", () => {
  beforeEach(() => {
    process.env.SANCTIONS_DENYLIST = `${BAD}, AnotherBadOne33333333333333333333333333333`;
  });
  afterEach(() => delete process.env.SANCTIONS_DENYLIST);

  test("a denylisted wallet is screened as sanctioned + blocked", () => {
    assert.equal(isSanctioned(BAD), true);
    const r = screenWallet(BAD);
    assert.equal(r.blocked, true);
    assert.match(r.reason ?? "", /OFAC/);
  });

  test("a clean wallet passes", () => {
    assert.equal(isSanctioned(GOOD), false);
    assert.deepEqual(screenWallet(GOOD), { blocked: false });
  });

  test("null / empty / non-string wallets are not blocked (no crash)", () => {
    assert.equal(isSanctioned(null), false);
    assert.equal(isSanctioned(""), false);
    assert.equal(isSanctioned(undefined), false);
    assert.equal(screenWallet(null).blocked, false);
  });

  test("env denylist is parsed (trim, comma-split) into the active set", () => {
    const set = sanctionsDenylist();
    assert.ok(set.has(BAD));
    assert.ok(set.has("AnotherBadOne33333333333333333333333333333"));
  });

  test("surrounding whitespace on the screened wallet is tolerated", () => {
    assert.equal(isSanctioned(`  ${BAD}  `), true);
  });
});

describe("C-105 · default denylist is empty (no fabricated addresses shipped)", () => {
  beforeEach(() => delete process.env.SANCTIONS_DENYLIST);
  test("with no env + the bundled (empty) file, nothing is blocked", () => {
    assert.equal(sanctionsDenylist().size, 0);
    assert.equal(isSanctioned(BAD), false);
  });
});
