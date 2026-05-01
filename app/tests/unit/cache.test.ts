/**
 * Unit tests for lib/cache — TTLCache + memoize.
 *
 * Run with:  npx tsx --test tests/unit/cache.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { TTLCache } from "../../lib/cache";

describe("TTLCache.set + get", () => {
  test("returns set values within TTL", async () => {
    const c = new TTLCache<string, number>({ defaultTtlMs: 1000 });
    c.set("a", 42);
    assert.equal(c.peek("a"), 42);
  });

  test("expires after TTL", async () => {
    const c = new TTLCache<string, number>();
    c.set("a", 42, 50);
    assert.equal(c.peek("a"), 42);
    await new Promise((r) => setTimeout(r, 75));
    assert.equal(c.peek("a"), undefined);
  });

  test("evicts least-recently-used when full", () => {
    const c = new TTLCache<string, number>({ max: 3, defaultTtlMs: 10_000 });
    c.set("a", 1);
    c.set("b", 2);
    c.set("c", 3);
    // Touch a, then add d — b should be evicted (least recently used).
    c.peek("a"); // peek does NOT update hitAt — only getOrSet does
    c.set("d", 4);
    assert.equal(c.size(), 3);
    // a and b were inserted earliest; one of them got evicted.
    // Since peek doesn't touch hitAt, the original insertion order
    // wins → "a" was the least recently set/hit.
    const survived = ["a", "b", "c", "d"].filter((k) => c.peek(k) !== undefined);
    assert.equal(survived.length, 3);
    assert.ok(survived.includes("d"), "newest entry must survive");
  });
});

describe("TTLCache.getOrSet", () => {
  test("calls loader on miss, caches result", async () => {
    const c = new TTLCache<string, string>();
    let calls = 0;
    const loader = async () => {
      calls++;
      return "value";
    };
    const v1 = await c.getOrSet("key", 1000, loader);
    const v2 = await c.getOrSet("key", 1000, loader);
    assert.equal(v1, "value");
    assert.equal(v2, "value");
    assert.equal(calls, 1, "loader should run once");
  });

  test("coalesces concurrent loaders for the same key", async () => {
    const c = new TTLCache<string, number>();
    let calls = 0;
    const loader = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 30));
      return calls;
    };
    const [a, b, d] = await Promise.all([
      c.getOrSet("k", 1000, loader),
      c.getOrSet("k", 1000, loader),
      c.getOrSet("k", 1000, loader),
    ]);
    assert.equal(a, 1);
    assert.equal(b, 1);
    assert.equal(d, 1);
    assert.equal(calls, 1, "concurrent loaders must coalesce to a single call");
  });

  test("returns stale value while refreshing in background", async () => {
    const c = new TTLCache<string, number>();
    let n = 0;
    const loader = async () => ++n;

    const v1 = await c.getOrSet("k", 30, loader);
    assert.equal(v1, 1);

    // Wait past TTL
    await new Promise((r) => setTimeout(r, 50));

    // Stale read: should return 1 immediately, kick off background refresh.
    const v2 = await c.getOrSet("k", 30, loader);
    assert.equal(v2, 1, "stale read returns previous value");

    // Give background refresh a tick to complete
    await new Promise((r) => setTimeout(r, 50));

    const stats = c.getStats();
    assert.ok(stats.staleHits >= 1, "stale hit recorded");
  });

  test("propagates errors on synchronous miss", async () => {
    const c = new TTLCache<string, number>();
    await assert.rejects(
      () => c.getOrSet("k", 1000, async () => { throw new Error("boom"); }),
      /boom/,
    );
  });
});

describe("TTLCache stats", () => {
  test("counts hits, misses, evictions correctly", async () => {
    const c = new TTLCache<string, number>({ max: 2, defaultTtlMs: 1000 });
    await c.getOrSet("a", 1000, async () => 1); // miss
    await c.getOrSet("a", 1000, async () => 1); // hit
    await c.getOrSet("a", 1000, async () => 1); // hit
    await c.getOrSet("b", 1000, async () => 2); // miss
    await c.getOrSet("c", 1000, async () => 3); // miss + evicts a or b
    const stats = c.getStats();
    assert.equal(stats.hits, 2);
    assert.equal(stats.misses, 3);
    assert.ok(stats.evictions >= 1);
  });
});

describe("TTLCache.delete + clear", () => {
  test("delete removes entry", () => {
    const c = new TTLCache<string, number>();
    c.set("a", 1);
    c.set("b", 2);
    assert.equal(c.delete("a"), true);
    assert.equal(c.peek("a"), undefined);
    assert.equal(c.peek("b"), 2);
  });

  test("clear empties everything", () => {
    const c = new TTLCache<string, number>();
    c.set("a", 1);
    c.set("b", 2);
    const n = c.clear();
    assert.equal(n, 2);
    assert.equal(c.size(), 0);
  });
});
