/**
 * Unit tests for lib/webhooks — signing, verification, delivery.
 *
 * Run with:  npx tsx --test tests/unit/webhooks.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  signWebhook,
  verifyWebhookSignature,
  generateEventId,
  buildEvent,
  deliverWebhook,
} from "../../lib/webhooks";

describe("signWebhook + verifyWebhookSignature", () => {
  test("round-trips correctly with the right secret", () => {
    const body = JSON.stringify({ id: "evt_abc", type: "job.created" });
    const ts = Date.now();
    const header = signWebhook(body, { secret: "sk_test_123", timestampMs: ts });
    assert.match(header, /^t=\d+,v1=[a-f0-9]{64}$/);
    const ok = verifyWebhookSignature({
      header,
      body,
      secret: "sk_test_123",
    });
    assert.equal(ok, true);
  });

  test("rejects wrong secret", () => {
    const body = "x";
    const header = signWebhook(body, { secret: "right" });
    const ok = verifyWebhookSignature({ header, body, secret: "wrong" });
    assert.equal(ok, false);
  });

  test("rejects modified body", () => {
    const body = "original";
    const header = signWebhook(body, { secret: "sk" });
    const ok = verifyWebhookSignature({
      header,
      body: "tampered",
      secret: "sk",
    });
    assert.equal(ok, false);
  });

  test("rejects expired timestamp (default 5min tolerance)", () => {
    const body = "x";
    const sixMinAgo = Date.now() - 6 * 60_000;
    const header = signWebhook(body, { secret: "sk", timestampMs: sixMinAgo });
    const ok = verifyWebhookSignature({ header, body, secret: "sk" });
    assert.equal(ok, false);
  });

  test("respects custom tolerance", () => {
    const body = "x";
    const sixMinAgo = Date.now() - 6 * 60_000;
    const header = signWebhook(body, { secret: "sk", timestampMs: sixMinAgo });
    const ok = verifyWebhookSignature({
      header,
      body,
      secret: "sk",
      toleranceMs: 10 * 60_000,
    });
    assert.equal(ok, true);
  });

  test("rejects malformed header", () => {
    const r1 = verifyWebhookSignature({
      header: "not-formatted",
      body: "x",
      secret: "sk",
    });
    const r2 = verifyWebhookSignature({
      header: null,
      body: "x",
      secret: "sk",
    });
    assert.equal(r1, false);
    assert.equal(r2, false);
  });

  test("rejects malformed hex signatures without throwing", () => {
    const ok = verifyWebhookSignature({
      header: `t=${Date.now()},v1=${"z".repeat(64)}`,
      body: "x",
      secret: "sk",
    });
    assert.equal(ok, false);
  });

  test("rejects replayed delivery ids when a replay cache is provided", () => {
    const body = JSON.stringify({ id: "evt_replay", type: "job.finalized" });
    const header = signWebhook(body, {
      secret: "sk",
      deliveryId: "evt_replay-1",
    });
    const replayCache = new Set<string>();
    const first = verifyWebhookSignature({
      header,
      body,
      secret: "sk",
      replayCache,
    });
    const second = verifyWebhookSignature({
      header,
      body,
      secret: "sk",
      replayCache,
    });
    assert.equal(first, true);
    assert.equal(second, false);
  });

  test("requires a signed delivery id when replay protection is enabled", () => {
    const body = "x";
    const header = signWebhook(body, { secret: "sk" });
    const ok = verifyWebhookSignature({
      header,
      body,
      secret: "sk",
      replayCache: new Set<string>(),
    });
    assert.equal(ok, false);
  });

  test("rejects delivery-id tampering", () => {
    const body = "x";
    const header = signWebhook(body, {
      secret: "sk",
      deliveryId: "evt_abc-1",
    });
    const tampered = header.replace("d=evt_abc-1", "d=evt_abc-2");
    const ok = verifyWebhookSignature({
      header: tampered,
      body,
      secret: "sk",
    });
    assert.equal(ok, false);
  });

  test("accepts any active secret during rotation", () => {
    const body = "x";
    const header = signWebhook(body, { secret: "previous-secret" });
    const ok = verifyWebhookSignature({
      header,
      body,
      secret: ["current-secret", "previous-secret"],
    });
    assert.equal(ok, true);
  });
});

describe("generateEventId", () => {
  test("produces unique evt_ ids", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) ids.add(generateEventId());
    assert.equal(ids.size, 50);
    for (const id of ids) {
      assert.match(id, /^evt_[a-f0-9]{16}$/);
    }
  });
});

describe("buildEvent", () => {
  test("produces a complete event with defaults", () => {
    const e = buildEvent("job.created", { id: "job_42", amount: 5 });
    assert.equal(e.type, "job.created");
    assert.equal(e.cluster, "devnet");
    assert.equal(e.v, 1);
    assert.match(e.id, /^evt_/);
    assert.ok(e.occurred_at <= Date.now());
    assert.deepEqual(e.data, { id: "job_42", amount: 5 });
  });

  test("respects explicit id + timestamp", () => {
    const e = buildEvent(
      "job.finalized",
      { jobId: "job_99" },
      { id: "evt_explicit", occurred_at: 1700000000000 },
    );
    assert.equal(e.id, "evt_explicit");
    assert.equal(e.occurred_at, 1700000000000);
  });
});

describe("deliverWebhook", () => {
  test("delivers a 200 on first attempt", async () => {
    const event = buildEvent("job.created", { id: "job_1" });
    let receivedHeaders: Record<string, string> | undefined;
    let receivedBody: string | undefined;
    const mockFetch = async (
      _url: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const headers: Record<string, string> = {};
      const h = init?.headers as HeadersInit;
      if (h && typeof h === "object") {
        for (const [k, v] of Object.entries(h as Record<string, string>)) {
          headers[k.toLowerCase()] = v;
        }
      }
      receivedHeaders = headers;
      receivedBody = init?.body as string;
      return new Response("", { status: 200 });
    };
    const result = await deliverWebhook(event, {
      url: "https://example.test/hook",
      secret: "sk",
      fetch: mockFetch as unknown as typeof globalThis.fetch,
      sleep: async () => {},
    });
    assert.equal(result.final_ok, true);
    assert.equal(result.attempts.length, 1);
    assert.equal(result.attempts[0].ok, true);
    assert.equal(result.attempts[0].status_code, 200);
    assert.ok(receivedHeaders);
    assert.equal(receivedHeaders!["x-covenant-event"], "job.created");
    assert.match(
      receivedHeaders!["x-covenant-signature"],
      /^t=\d+,d=evt_.+-1,v1=[a-f0-9]+$/,
    );
    assert.match(receivedHeaders!["x-covenant-delivery"], /^evt_.+-1$/);
    assert.equal(JSON.parse(receivedBody!).id, event.id);
  });

  test("retries on 5xx with exponential backoff", async () => {
    const event = buildEvent("job.delivered", { id: "job_2" });
    let calls = 0;
    let totalSleepMs = 0;
    const mockFetch = async (): Promise<Response> => {
      calls++;
      if (calls < 3) return new Response("", { status: 503 });
      return new Response("", { status: 200 });
    };
    const result = await deliverWebhook(event, {
      url: "https://example.test/hook",
      secret: "sk",
      fetch: mockFetch as unknown as typeof globalThis.fetch,
      sleep: async (ms) => {
        totalSleepMs += ms;
      },
      maxAttempts: 5,
    });
    assert.equal(result.attempts.length, 3);
    assert.equal(result.final_ok, true);
    assert.ok(totalSleepMs > 0, "should sleep between retries");
  });

  test("does NOT retry on 4xx (except 429)", async () => {
    const event = buildEvent("claim.bought", { id: "claim_1" });
    let calls = 0;
    const mockFetch = async (): Promise<Response> => {
      calls++;
      return new Response("", { status: 404 });
    };
    const result = await deliverWebhook(event, {
      url: "https://example.test/hook",
      secret: "sk",
      fetch: mockFetch as unknown as typeof globalThis.fetch,
      sleep: async () => {},
    });
    assert.equal(calls, 1, "404 should not retry");
    assert.equal(result.final_ok, false);
    assert.equal(result.attempts[0].status_code, 404);
  });

  test("retries on 429 specifically", async () => {
    const event = buildEvent("battle.completed", { id: "b1" });
    let calls = 0;
    const mockFetch = async (): Promise<Response> => {
      calls++;
      return new Response("", { status: 429 });
    };
    const result = await deliverWebhook(event, {
      url: "https://example.test/hook",
      secret: "sk",
      fetch: mockFetch as unknown as typeof globalThis.fetch,
      sleep: async () => {},
      maxAttempts: 3,
    });
    assert.equal(calls, 3);
    assert.equal(result.final_ok, false);
  });

  test("captures fetch errors per-attempt", async () => {
    const event = buildEvent("job.cancelled", { id: "job_x" });
    const mockFetch = async (): Promise<Response> => {
      throw new Error("ECONNREFUSED");
    };
    const result = await deliverWebhook(event, {
      url: "https://example.test/hook",
      secret: "sk",
      fetch: mockFetch as unknown as typeof globalThis.fetch,
      sleep: async () => {},
      maxAttempts: 2,
    });
    assert.equal(result.attempts.length, 2);
    assert.equal(result.final_ok, false);
    assert.match(result.attempts[0].error ?? "", /ECONNREFUSED/);
  });

  test("uses correct delivery id format per attempt", async () => {
    const event = buildEvent("job.accepted", { id: "j1" }, { id: "evt_xyz" });
    const ids: string[] = [];
    const mockFetch = async (
      _url: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const h = init?.headers as Record<string, string>;
      ids.push(h["X-Covenant-Delivery"]);
      return new Response("", { status: 503 });
    };
    await deliverWebhook(event, {
      url: "https://example.test/hook",
      secret: "sk",
      fetch: mockFetch as unknown as typeof globalThis.fetch,
      sleep: async () => {},
      maxAttempts: 3,
    });
    assert.deepEqual(ids, ["evt_xyz-1", "evt_xyz-2", "evt_xyz-3"]);
  });
});
