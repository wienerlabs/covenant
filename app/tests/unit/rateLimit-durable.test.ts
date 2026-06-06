/**
 * Unit tests for lib/rateLimit durable-limiter pure logic (C-092 / H-04).
 *
 * The Postgres-backed `rateLimitDurable` itself needs a DB; here we test the
 * pure window/key/response helpers it is built from.
 *
 * Run with:  npx tsx --test tests/unit/rateLimit-durable.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  windowBucket,
  compoundKey,
  rateLimited429,
  type RateLimitResult,
} from "../../lib/rateLimit";

describe("windowBucket", () => {
  test("maps the same fixed window to the same bucket", () => {
    // Windows are epoch-aligned: window 16 spans [960_000, 1_020_000).
    const w = 60_000;
    const a = windowBucket("k", w, 960_000);
    const b = windowBucket("k", w, 960_000 + 59_999);
    assert.equal(a.bucket, b.bucket);
  });

  test("rolls to a new bucket at the window boundary", () => {
    const w = 60_000;
    const a = windowBucket("k", w, 960_000);
    const c = windowBucket("k", w, 960_000 + 60_000); // next window
    assert.notEqual(a.bucket, c.bucket);
  });

  test("resetAt is the end of the current window", () => {
    // now=120_000, window=60_000 → index 2 → reset at 180_000
    assert.equal(windowBucket("k", 60_000, 120_000).resetAt, 180_000);
  });

  test("different keys never share a bucket", () => {
    const a = windowBucket("a", 60_000, 1_000_000);
    const b = windowBucket("b", 60_000, 1_000_000);
    assert.notEqual(a.bucket, b.bucket);
  });
});

describe("compoundKey", () => {
  test("combines op + wallet + ip", () => {
    assert.equal(compoundKey({ op: "faucet", wallet: "W", ip: "1.2.3.4" }), "faucet:W:1.2.3.4");
  });
  test("uses '-' placeholders for missing parts", () => {
    assert.equal(compoundKey({ op: "faucet", ip: "1.2.3.4" }), "faucet:-:1.2.3.4");
    assert.equal(compoundKey({ op: "faucet", wallet: "W" }), "faucet:W:-");
    assert.equal(compoundKey({ op: "faucet" }), "faucet:-:-");
  });
  test("keeps per-wallet and per-ip limits in separate keyspaces", () => {
    const wallet = compoundKey({ op: "faucet", wallet: "W" });
    const ip = compoundKey({ op: "faucet_ip", ip: "1.2.3.4" });
    assert.notEqual(wallet, ip);
  });
});

describe("rateLimited429", () => {
  test("returns a 429 with a Retry-After header and JSON body", async () => {
    const result: RateLimitResult = {
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 30_000,
    };
    const res = rateLimited429(result);
    assert.equal(res.status, 429);
    const retryAfter = Number(res.headers.get("Retry-After"));
    assert.ok(retryAfter >= 28 && retryAfter <= 31, `Retry-After ~30s, got ${retryAfter}`);
    const body = (await res.json()) as { error: string; resetAt: number };
    assert.match(body.error, /Rate limit exceeded/);
    assert.equal(body.resetAt, result.resetAt);
  });
});
