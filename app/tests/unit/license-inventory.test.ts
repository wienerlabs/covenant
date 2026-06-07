/**
 * Unit tests for the C-107 license policy (lib/license-policy).
 *
 * Run with:  npx tsx --test tests/unit/license-inventory.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  permissiveSpdx,
  classify,
  ASSESSED,
  PERMISSIVE,
} from "../../lib/license-policy";

describe("permissiveSpdx", () => {
  test("accepts common permissive SPDX ids", () => {
    for (const id of ["MIT", "Apache-2.0", "ISC", "BSD-3-Clause", "Unlicense", "0BSD"]) {
      assert.equal(permissiveSpdx(id), true, id);
    }
  });

  test("rejects copyleft and proprietary licenses", () => {
    for (const id of ["GPL-3.0", "AGPL-3.0", "LGPL-2.1-only", "SEE LICENSE IN LICENSE.md", "UNKNOWN"]) {
      assert.equal(permissiveSpdx(id), false, id);
    }
  });

  test("accepts an OR-expression when any operand is permissive", () => {
    assert.equal(permissiveSpdx("(MIT OR Apache-2.0)"), true);
    assert.equal(permissiveSpdx("(MIT OR GPL-3.0)"), true);
    assert.equal(permissiveSpdx("MIT OR Apache-2.0"), true);
  });

  test("rejects an OR-expression with no permissive operand", () => {
    assert.equal(permissiveSpdx("(GPL-3.0 OR Commercial)"), false);
  });
});

describe("classify", () => {
  test("permissive license → ok", () => {
    assert.deepEqual(classify("react", "MIT"), { status: "ok" });
  });

  test("an assessed 'review' dependency → review, with its note", () => {
    const r = classify(
      "@walletconnect/universal-provider",
      "SEE LICENSE IN LICENSE.md",
    );
    assert.equal(r.status, "review");
    assert.match(r.note ?? "", /WalletConnect Community License/);
  });

  test("an unknown/unassessed non-permissive license → fail", () => {
    assert.deepEqual(classify("some-random-pkg", "GPL-3.0"), { status: "fail" });
    assert.deepEqual(classify("missing-pkg", "NOT-INSTALLED"), { status: "fail" });
  });
});

describe("policy invariants", () => {
  test("PERMISSIVE is non-empty and contains the staples", () => {
    assert.ok(PERMISSIVE.has("MIT"));
    assert.ok(PERMISSIVE.has("Apache-2.0"));
  });

  test("the WalletConnect runtime dep is tracked for legal review", () => {
    assert.equal(ASSESSED["@walletconnect/universal-provider"]?.status, "review");
  });
});
