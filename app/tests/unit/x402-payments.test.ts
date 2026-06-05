/**
 * Unit tests for lib/x402-payments — replay + idempotency decision logic.
 *
 * Covers C-032 (a signature spent for a different prompt is consumed)
 * and C-036 (a retry of the same prompt replays the cached response).
 * Only the pure functions are exercised here; the Prisma-backed wiring
 * is a thin shell over `decidePaymentClaim`.
 *
 * Run with:  npx tsx --test tests/unit/x402-payments.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  hashPaymentRequest,
  decidePaymentClaim,
} from "../../lib/x402-payments";

describe("hashPaymentRequest", () => {
  test("is deterministic for the same agent + message", () => {
    assert.equal(
      hashPaymentRequest("agent_1", "hello world"),
      hashPaymentRequest("agent_1", "hello world"),
    );
  });
  test("differs by message", () => {
    assert.notEqual(
      hashPaymentRequest("agent_1", "prompt A"),
      hashPaymentRequest("agent_1", "prompt B"),
    );
  });
  test("differs by agent", () => {
    assert.notEqual(
      hashPaymentRequest("agent_1", "same"),
      hashPaymentRequest("agent_2", "same"),
    );
  });
  test("produces a 64-char hex digest", () => {
    assert.match(hashPaymentRequest("a", "b"), /^[a-f0-9]{64}$/);
  });
});

describe("decidePaymentClaim", () => {
  const reqHash = hashPaymentRequest("agent_1", "the paid prompt");

  test("fresh: no prior record ⇒ proceed", () => {
    assert.deepEqual(decidePaymentClaim(null, reqHash), { kind: "fresh" });
  });

  test("C-036 replay: same prompt + finalized response ⇒ serve cached", () => {
    const decision = decidePaymentClaim(
      { requestHash: reqHash, responseBody: '{"response":"hi"}', responseCode: 200 },
      reqHash,
    );
    assert.deepEqual(decision, {
      kind: "replay",
      body: '{"response":"hi"}',
      code: 200,
    });
  });

  test("pending: same prompt but response not yet finalized ⇒ retry", () => {
    const decision = decidePaymentClaim(
      { requestHash: reqHash, responseBody: null, responseCode: null },
      reqHash,
    );
    assert.deepEqual(decision, { kind: "pending" });
  });

  test("pending: body present but code missing is still in-flight", () => {
    const decision = decidePaymentClaim(
      { requestHash: reqHash, responseBody: "partial", responseCode: null },
      reqHash,
    );
    assert.deepEqual(decision, { kind: "pending" });
  });

  test("C-032 consumed: same payment, different prompt ⇒ reject", () => {
    const otherHash = hashPaymentRequest("agent_1", "a different prompt");
    const decision = decidePaymentClaim(
      { requestHash: reqHash, responseBody: '{"response":"hi"}', responseCode: 200 },
      otherHash,
    );
    assert.deepEqual(decision, { kind: "consumed" });
  });

  test("C-032 consumed: replay attack even before the first response finalizes", () => {
    const otherHash = hashPaymentRequest("agent_1", "second prompt");
    const decision = decidePaymentClaim(
      { requestHash: reqHash, responseBody: null, responseCode: null },
      otherHash,
    );
    assert.deepEqual(decision, { kind: "consumed" });
  });
});
