/**
 * Unit tests for lib/api-response — ok() / fail() / failFromError().
 *
 * Run with:  npx tsx --test tests/unit/api-response.test.ts
 *
 * NextResponse is just a Response subclass, so we can read body +
 * headers without spinning up a real Next.js server.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ok, fail, failFromError } from "../../lib/api-response";

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  return JSON.parse(text);
}

describe("ok()", () => {
  test("returns 200 with envelope by default", async () => {
    const res = ok({ message: "hello" });
    assert.equal(res.status, 200);
    const body = await readJson(res);
    assert.equal(body.ok, true);
    assert.deepEqual(body.data, { message: "hello" });
    assert.ok(typeof body.request_id === "string");
    assert.ok((body.request_id as string).startsWith("req_"));
  });

  test("attaches x-request-id header", async () => {
    const res = ok("payload");
    const reqId = res.headers.get("x-request-id");
    assert.ok(reqId !== null);
    assert.match(reqId as string, /^req_[a-f0-9]+$/);
  });

  test("preserves explicit request_id and reuses it as header", async () => {
    const res = ok("payload", { request_id: "req_test123" });
    assert.equal(res.headers.get("x-request-id"), "req_test123");
    const body = await readJson(res);
    assert.equal(body.request_id, "req_test123");
  });

  test("includes meta when provided", async () => {
    const res = ok([1, 2, 3], { meta: { total: 3, page: 1 } });
    const body = await readJson(res);
    assert.deepEqual(body.meta, { total: 3, page: 1 });
  });

  test("respects custom status", async () => {
    const res = ok({ id: "x" }, { status: 201 });
    assert.equal(res.status, 201);
  });
});

describe("fail()", () => {
  test("maps invalid_input → 400", async () => {
    const res = fail("invalid_input", "Validation broke");
    assert.equal(res.status, 400);
    const body = await readJson(res);
    assert.equal(body.ok, false);
    const err = body.error as Record<string, unknown>;
    assert.equal(err.code, "invalid_input");
    assert.equal(err.message, "Validation broke");
  });

  test("maps rate_limited → 429 + Retry-After respected via headers", async () => {
    const res = fail("rate_limited", "Slow down", {
      headers: { "Retry-After": "30" },
    });
    assert.equal(res.status, 429);
    assert.equal(res.headers.get("retry-after"), "30");
  });

  test("maps db_unavailable → 503", async () => {
    const res = fail("db_unavailable", "DB paused");
    assert.equal(res.status, 503);
  });

  test("maps internal_error → 500", async () => {
    const res = fail("internal_error", "boom");
    assert.equal(res.status, 500);
  });

  test("includes details when provided", async () => {
    const res = fail("invalid_input", "bad", {
      details: { field: "name" },
    });
    const body = await readJson(res);
    const err = body.error as Record<string, unknown>;
    assert.deepEqual(err.details, { field: "name" });
  });

  test("status override beats code default", async () => {
    const res = fail("invalid_input", "x", { status: 422 });
    assert.equal(res.status, 422);
  });
});

describe("failFromError()", () => {
  test("matches Prisma 'can't reach database' → db_unavailable", async () => {
    const err = new Error("Can't reach database server at host");
    const res = failFromError(err);
    assert.equal(res.status, 503);
    const body = await readJson(res);
    assert.equal((body.error as Record<string, unknown>).code, "db_unavailable");
  });

  test("matches Prisma 'connection terminated' → db_unavailable", async () => {
    const err = new Error("connection terminated unexpectedly");
    const res = failFromError(err);
    assert.equal(res.status, 503);
  });

  test("matches Prisma 'relation does not exist' → db_unavailable", async () => {
    const err = new Error('relation "Job" does not exist');
    const res = failFromError(err);
    assert.equal(res.status, 503);
  });

  test("matches Prisma 'Unique constraint failed' → conflict (409)", async () => {
    const err = new Error("Unique constraint failed on the fields: (`pda`)");
    const res = failFromError(err);
    assert.equal(res.status, 409);
    const body = await readJson(res);
    assert.equal((body.error as Record<string, unknown>).code, "conflict");
  });

  test("matches Zod-style .issues array → invalid_input", async () => {
    const zodLike = { issues: [{ path: "name", message: "Required" }] };
    const res = failFromError(zodLike);
    assert.equal(res.status, 400);
    const body = await readJson(res);
    const err = body.error as Record<string, unknown>;
    assert.equal(err.code, "invalid_input");
    assert.deepEqual((err.details as Record<string, unknown>).issues, zodLike.issues);
  });

  test("falls back to internal_error for unknown shapes", async () => {
    const res = failFromError(new Error("totally unrelated"));
    assert.equal(res.status, 500);
    const body = await readJson(res);
    assert.equal((body.error as Record<string, unknown>).code, "internal_error");
  });

  test("custom fallback code respected", async () => {
    const res = failFromError(new Error("oddball"), "wallet_signature_failed");
    const body = await readJson(res);
    assert.equal((body.error as Record<string, unknown>).code, "wallet_signature_failed");
  });
});
