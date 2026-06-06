/**
 * Unit tests for webhook signature secret rotation (C-094).
 *
 * Run with:  npx tsx --test tests/unit/webhooks-rotation.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { signWebhook, verifyWebhookSignature } from "../../lib/webhooks";

describe("verifyWebhookSignature — secret rotation", () => {
  test("verifies against a single secret (back-compat)", () => {
    const body = JSON.stringify({ id: "e1" });
    const header = signWebhook(body, { secret: "old" });
    assert.equal(verifyWebhookSignature({ header, body, secret: "old" }), true);
  });

  test("accepts either key during rotation [new, old]", () => {
    const body = "payload";
    const signedOld = signWebhook(body, { secret: "old-key" });
    const signedNew = signWebhook(body, { secret: "new-key" });
    assert.equal(
      verifyWebhookSignature({ header: signedOld, body, secret: ["new-key", "old-key"] }),
      true,
    );
    assert.equal(
      verifyWebhookSignature({ header: signedNew, body, secret: ["new-key", "old-key"] }),
      true,
    );
  });

  test("rejects a key that has been retired", () => {
    const body = "payload";
    const signedOld = signWebhook(body, { secret: "old-key" });
    assert.equal(verifyWebhookSignature({ header: signedOld, body, secret: ["new-key"] }), false);
  });

  test("rejects a stale timestamp even with a valid secret", () => {
    const body = "payload";
    const sixMinAgo = Date.now() - 6 * 60_000;
    const header = signWebhook(body, { secret: "k", timestampMs: sixMinAgo });
    assert.equal(verifyWebhookSignature({ header, body, secret: ["k", "old"] }), false);
  });

  test("rejects a tampered body across all secrets", () => {
    const header = signWebhook("original", { secret: "k" });
    assert.equal(verifyWebhookSignature({ header, body: "tampered", secret: ["k", "old"] }), false);
  });

  test("ignores empty secrets in the rotation array", () => {
    const body = "p";
    const header = signWebhook(body, { secret: "real" });
    assert.equal(verifyWebhookSignature({ header, body, secret: ["", "real"] }), true);
  });

  test("rejects a malformed signature value", () => {
    assert.equal(
      verifyWebhookSignature({ header: "t=" + Date.now() + ",v1=zzzz", body: "x", secret: "k" }),
      false,
    );
  });
});
