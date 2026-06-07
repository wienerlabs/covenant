/**
 * Unit tests for C-064 RPC failover backoff + rate budget (lib/rpc-failover).
 *
 * Run with:  npx tsx --test tests/unit/rpc-failover.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isRetryable,
  isRateLimited,
  backoffDelayMs,
  RpcRateBudget,
  callWithFailover,
} from "../../lib/rpc-failover";

describe("C-064 · error classification", () => {
  test("retryable: 429, rate limit, 5xx, network blips", () => {
    for (const m of [
      "Server responded 429",
      "rate limit exceeded",
      "503 Service Unavailable",
      "ETIMEDOUT",
      "ECONNRESET",
      "failed to fetch",
    ]) {
      assert.equal(isRetryable(new Error(m)), true, m);
    }
  });

  test("not retryable: deterministic program/logic errors", () => {
    for (const m of ["custom program error: 0x1", "invalid account", "Blockhash not found"]) {
      assert.equal(isRetryable(new Error(m)), false, m);
    }
  });

  test("isRateLimited isolates 429/rate-limit from other transient errors", () => {
    assert.equal(isRateLimited(new Error("429 too many requests")), true);
    assert.equal(isRateLimited(new Error("rate-limit")), true);
    assert.equal(isRateLimited(new Error("ETIMEDOUT")), false);
    assert.equal(isRateLimited(new Error("503")), false);
  });
});

describe("C-064 · backoffDelayMs (exponential + jitter)", () => {
  const noJitter = () => 1; // rand()=1 → 100% of the ceiling

  test("grows exponentially with the attempt", () => {
    assert.equal(backoffDelayMs(0, { baseMs: 100, rand: noJitter }), 100);
    assert.equal(backoffDelayMs(1, { baseMs: 100, rand: noJitter }), 200);
    assert.equal(backoffDelayMs(2, { baseMs: 100, rand: noJitter }), 400);
  });

  test("is capped at maxMs", () => {
    assert.equal(backoffDelayMs(20, { baseMs: 100, maxMs: 1000, rand: noJitter }), 1000);
  });

  test("rate-limited errors back off harder (4x base)", () => {
    const normal = backoffDelayMs(0, { baseMs: 100, rand: noJitter });
    const limited = backoffDelayMs(0, { baseMs: 100, rateLimited: true, rand: noJitter });
    assert.equal(limited, normal * 4);
  });

  test("jitter keeps the delay within [50%, 100%] of the ceiling", () => {
    const lo = backoffDelayMs(1, { baseMs: 100, rand: () => 0 }); // 50%
    const hi = backoffDelayMs(1, { baseMs: 100, rand: () => 1 }); // 100%
    assert.equal(lo, 100);
    assert.equal(hi, 200);
  });
});

describe("C-064 · RpcRateBudget (token bucket)", () => {
  test("allows up to the burst, then blocks until refill", () => {
    let t = 0;
    const b = new RpcRateBudget({ ratePerSec: 10, burst: 3, now: () => t });
    assert.equal(b.tryTake(), true);
    assert.equal(b.tryTake(), true);
    assert.equal(b.tryTake(), true);
    assert.equal(b.tryTake(), false); // burst exhausted
    assert.ok(b.msUntilToken() > 0);
  });

  test("refills over time at ratePerSec", () => {
    let t = 0;
    const b = new RpcRateBudget({ ratePerSec: 10, burst: 1, now: () => t });
    assert.equal(b.tryTake(), true);
    assert.equal(b.tryTake(), false);
    assert.equal(b.msUntilToken(), 100); // 1 token / 10ps = 100ms
    t = 100; // advance 100ms → 1 token back
    assert.equal(b.tryTake(), true);
  });
});

describe("C-064 · callWithFailover (retry loop)", () => {
  const passthroughDelay = (attempt: number) => attempt; // deterministic

  test("retries a retryable failure, backing off + rotating, then succeeds", async () => {
    const sleeps: number[] = [];
    const rotations: number[] = [];
    let calls = 0;
    const result = await callWithFailover(
      async () => {
        calls++;
        if (calls < 3) throw new Error("429");
        return "ok";
      },
      {
        maxAttempts: 5,
        isRetryable,
        delayFor: passthroughDelay,
        sleep: async (ms) => void sleeps.push(ms),
        onRetry: (attempt) => void rotations.push(attempt),
      },
    );
    assert.equal(result, "ok");
    assert.equal(calls, 3); // two failures + success
    assert.deepEqual(sleeps, [0, 1]); // backed off before each of the 2 retries
    assert.deepEqual(rotations, [0, 1]); // rotated twice
  });

  test("throws immediately on a non-retryable error (no backoff, no rotate)", async () => {
    const sleeps: number[] = [];
    await assert.rejects(
      callWithFailover(
        async () => {
          throw new Error("custom program error");
        },
        {
          maxAttempts: 5,
          isRetryable,
          delayFor: passthroughDelay,
          sleep: async (ms) => void sleeps.push(ms),
          onRetry: () => {},
        },
      ),
      /custom program error/,
    );
    assert.equal(sleeps.length, 0);
  });

  test("gives up after maxAttempts and throws the last error", async () => {
    let calls = 0;
    await assert.rejects(
      callWithFailover(
        async () => {
          calls++;
          throw new Error("503");
        },
        {
          maxAttempts: 3,
          isRetryable,
          delayFor: () => 0,
          sleep: async () => {},
          onRetry: () => {},
        },
      ),
      /503/,
    );
    assert.equal(calls, 3);
  });
});
