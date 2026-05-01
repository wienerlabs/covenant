/**
 * Unit tests for lib/error-buffer.
 *
 * Run with:  npx tsx --test tests/unit/error-buffer.test.ts
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  recordError,
  readErrorBuffer,
  clearErrorBuffer,
  bufferStats,
} from "../../lib/error-buffer";

beforeEach(() => {
  clearErrorBuffer();
});

describe("error-buffer", () => {
  test("recordError + readErrorBuffer returns newest first", () => {
    recordError({ ts: "2026-05-01T10:00:00.000Z", level: "error", msg: "first" });
    recordError({ ts: "2026-05-01T10:00:01.000Z", level: "error", msg: "second" });
    recordError({ ts: "2026-05-01T10:00:02.000Z", level: "error", msg: "third" });

    const all = readErrorBuffer();
    assert.equal(all.length, 3);
    assert.equal(all[0].msg, "third", "newest first");
    assert.equal(all[2].msg, "first", "oldest last");
  });

  test("each entry gets a recorded_at timestamp", () => {
    const before = Date.now();
    recordError({ ts: "ignored", level: "error", msg: "x" });
    const after = Date.now();
    const [entry] = readErrorBuffer();
    const recordedAt = new Date(entry.recorded_at).getTime();
    assert.ok(recordedAt >= before && recordedAt <= after);
  });

  test("preserves arbitrary structured fields", () => {
    recordError({
      ts: "now",
      level: "error",
      msg: "boom",
      request_id: "req_abc123",
      route: "/api/jobs",
      err_message: "Cannot reach DB",
      err_stack: "stack trace here",
    });
    const [e] = readErrorBuffer();
    assert.equal(e.request_id, "req_abc123");
    assert.equal(e.route, "/api/jobs");
    assert.equal(e.err_message, "Cannot reach DB");
    assert.equal(e.err_stack, "stack trace here");
  });

  test("ring buffer caps at 100 entries", () => {
    for (let i = 0; i < 150; i++) {
      recordError({ ts: "x", level: "error", msg: `msg-${i}` });
    }
    const all = readErrorBuffer();
    assert.equal(all.length, 100, "must cap at 100");
    // Newest first → first item is msg-149
    assert.equal(all[0].msg, "msg-149");
    // Last item is msg-50 (oldest 50 dropped)
    assert.equal(all[99].msg, "msg-50");
  });

  test("clearErrorBuffer empties + returns count", () => {
    recordError({ ts: "x", level: "error", msg: "1" });
    recordError({ ts: "x", level: "error", msg: "2" });
    const cleared = clearErrorBuffer();
    assert.equal(cleared, 2);
    assert.equal(readErrorBuffer().length, 0);
  });

  test("bufferStats reports size, capacity, oldest, newest", () => {
    const empty = bufferStats();
    assert.equal(empty.count, 0);
    assert.equal(empty.oldest, null);
    assert.equal(empty.newest, null);

    recordError({ ts: "x", level: "error", msg: "1" });
    recordError({ ts: "x", level: "error", msg: "2" });
    const s = bufferStats();
    assert.equal(s.count, 2);
    assert.equal(s.capacity, 100);
    assert.ok(s.oldest !== null);
    assert.ok(s.newest !== null);
    assert.ok(new Date(s.oldest!).getTime() <= new Date(s.newest!).getTime());
  });
});
