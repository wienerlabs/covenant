/**
 * Unit tests for lib/idempotency.
 *
 * Run with:  npx tsx --test tests/unit/idempotency.test.ts
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  parseIdempotencyKey,
  getCachedIdempotent,
  reserveIdempotent,
  recordIdempotent,
  releaseIdempotent,
  clearIdempotency,
  idempotencyStats,
} from "../../lib/idempotency";

beforeEach(() => {
  clearIdempotency();
});

function makeReq(headers: Record<string, string>): Request {
  return new Request("http://test/x", { method: "POST", headers });
}

describe("parseIdempotencyKey", () => {
  test("reads Idempotency-Key header", () => {
    const k = parseIdempotencyKey(makeReq({ "Idempotency-Key": "key-12345678" }));
    assert.equal(k, "key-12345678");
  });

  test("reads X-Idempotency-Key as fallback", () => {
    const k = parseIdempotencyKey(makeReq({ "X-Idempotency-Key": "fallback-key-abc" }));
    assert.equal(k, "fallback-key-abc");
  });

  test("rejects too-short keys", () => {
    const k = parseIdempotencyKey(makeReq({ "Idempotency-Key": "short" }));
    assert.equal(k, null);
  });

  test("rejects keys with bad characters", () => {
    const k = parseIdempotencyKey(makeReq({ "Idempotency-Key": "has spaces" }));
    assert.equal(k, null);
  });

  test("returns null when no header", () => {
    const k = parseIdempotencyKey(makeReq({}));
    assert.equal(k, null);
  });

  test("does NOT use auto-stamped x-request-id (would defeat idempotency)", () => {
    const k = parseIdempotencyKey(makeReq({ "x-request-id": "req_autostamped" }));
    assert.equal(k, null);
  });
});

describe("reserveIdempotent + recordIdempotent + replay", () => {
  test("reserves a fresh key", () => {
    assert.equal(reserveIdempotent("k1-12345678"), true);
    const stats = idempotencyStats();
    assert.equal(stats.size, 1);
    assert.equal(stats.inflight, 1);
  });

  test("rejects re-reservation of an in-flight key", () => {
    assert.equal(reserveIdempotent("k2-12345678"), true);
    assert.equal(reserveIdempotent("k2-12345678"), false);
  });

  test("replays a cached response byte-identically", async () => {
    const key = "replay-key-12345678";
    reserveIdempotent(key);
    const original = new Response(
      JSON.stringify({ ok: true, data: { id: "job_42" } }),
      { status: 201, headers: { "content-type": "application/json", "x-request-id": "req_abc" } },
    );
    await recordIdempotent(key, original);

    const hit = await getCachedIdempotent(key);
    assert.ok(hit, "should be a hit");
    assert.equal(hit?.response.status, 201);
    assert.equal(hit?.response.headers.get("x-request-id"), "req_abc");
    assert.equal(hit?.response.headers.get("x-idempotent-replay"), "true");
    const body = await hit!.response.text();
    assert.deepEqual(JSON.parse(body), { ok: true, data: { id: "job_42" } });
  });

  test("expired entries are evicted on read", async () => {
    const key = "tiny-ttl-12345678";
    reserveIdempotent(key, 30);
    const r = new Response("payload", { status: 200 });
    await recordIdempotent(key, r, 30);
    await new Promise((res) => setTimeout(res, 60));
    const hit = await getCachedIdempotent(key);
    assert.equal(hit, null);
  });

  test("releaseIdempotent removes the slot so reservers can retry", () => {
    const key = "release-key-12345678";
    assert.equal(reserveIdempotent(key), true);
    assert.equal(reserveIdempotent(key), false);
    releaseIdempotent(key);
    assert.equal(reserveIdempotent(key), true);
  });
});

describe("idempotencyStats", () => {
  test("reports size, inflight, capacity", async () => {
    reserveIdempotent("a-12345678");
    reserveIdempotent("b-12345678");
    const r = new Response("done", { status: 200 });
    await recordIdempotent("a-12345678", r);
    const stats = idempotencyStats();
    assert.equal(stats.size, 2);
    assert.equal(stats.inflight, 1, "only b is still in-flight");
    assert.ok(stats.capacity > 0);
  });
});
