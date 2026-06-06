/**
 * Unit tests for lib/admin-auth + lib/secure-compare (C-095).
 *
 * Run with:  npx tsx --test tests/unit/admin-auth.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { requireAdmin } from "../../lib/admin-auth";
import { constantTimeEqual } from "../../lib/secure-compare";

function reqWith(auth?: string): Request {
  return new Request("http://test/api/admin", {
    headers: auth ? { authorization: auth } : {},
  });
}

const ORIG_ADMIN = process.env.ADMIN_SECRET;
const ORIG_CRON = process.env.CRON_SECRET;
function restoreEnv() {
  if (ORIG_ADMIN === undefined) delete process.env.ADMIN_SECRET;
  else process.env.ADMIN_SECRET = ORIG_ADMIN;
  if (ORIG_CRON === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIG_CRON;
}

describe("requireAdmin", () => {
  test("denies when no secret is configured (fail closed)", () => {
    delete process.env.ADMIN_SECRET;
    delete process.env.CRON_SECRET;
    const r = requireAdmin(reqWith("Bearer anything"));
    assert.equal(r.ok, false);
    assert.match(r.reason ?? "", /not configured/);
    restoreEnv();
  });

  test("accepts the correct bearer secret", () => {
    process.env.ADMIN_SECRET = "s3cr3t";
    delete process.env.CRON_SECRET;
    assert.equal(requireAdmin(reqWith("Bearer s3cr3t")).ok, true);
    restoreEnv();
  });

  test("rejects a wrong secret", () => {
    process.env.ADMIN_SECRET = "s3cr3t";
    const r = requireAdmin(reqWith("Bearer wrong"));
    assert.equal(r.ok, false);
    assert.match(r.reason ?? "", /invalid/);
    restoreEnv();
  });

  test("rejects a missing authorization header", () => {
    process.env.ADMIN_SECRET = "s3cr3t";
    assert.equal(requireAdmin(reqWith()).ok, false);
    restoreEnv();
  });

  test("rejects a bare secret without the Bearer prefix", () => {
    process.env.ADMIN_SECRET = "s3cr3t";
    assert.equal(requireAdmin(reqWith("s3cr3t")).ok, false);
    restoreEnv();
  });

  test("falls back to CRON_SECRET when ADMIN_SECRET is unset", () => {
    delete process.env.ADMIN_SECRET;
    process.env.CRON_SECRET = "cron-key";
    assert.equal(requireAdmin(reqWith("Bearer cron-key")).ok, true);
    restoreEnv();
  });
});

describe("constantTimeEqual", () => {
  test("true for equal strings", () => {
    assert.equal(constantTimeEqual("abc123", "abc123"), true);
  });
  test("false for differing strings of equal length", () => {
    assert.equal(constantTimeEqual("abc123", "abc124"), false);
  });
  test("false for different lengths", () => {
    assert.equal(constantTimeEqual("abc", "abcd"), false);
  });
  test("false for empty vs non-empty", () => {
    assert.equal(constantTimeEqual("", "x"), false);
  });
});
