/**
 * Unit tests for the C-112 alerting module (lib/alerts).
 *
 * Run with:  npx tsx --test tests/unit/alerts.test.ts
 */

import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  formatAlert,
  sendAlert,
  alertCrankFailure,
  alertRpcDown,
  alertDbQuota,
  alertDisputeSpike,
} from "../../lib/alerts";

const WEBHOOK = "https://hooks.example/T/B/X";

function captureFetch() {
  const calls: { url: string; body: unknown }[] = [];
  const fetch = (async (url: string, init?: { body?: string }) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : null });
    return { ok: true } as Response;
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

describe("C-112 · formatAlert (pure)", () => {
  test("renders severity, title, detail, and fields", () => {
    const { text } = formatAlert({
      severity: "critical",
      title: "crank: finalize failed",
      detail: "tx reverted",
      fields: { jobId: "abc", attempt: 3 },
    });
    assert.match(text, /CRITICAL/);
    assert.match(text, /crank: finalize failed/);
    assert.match(text, /tx reverted/);
    assert.match(text, /jobId=abc/);
    assert.match(text, /attempt=3/);
  });

  test("omits empty/undefined fields", () => {
    const { text } = formatAlert({ severity: "info", title: "t", fields: { a: "x", b: undefined, c: "" } });
    assert.match(text, /a=x/);
    assert.doesNotMatch(text, /b=/);
    assert.doesNotMatch(text, /c=/);
  });
});

describe("C-112 · sendAlert", () => {
  afterEach(() => delete process.env.ALERT_WEBHOOK_URL);

  test("no webhook configured → no-op, returns false, fetch not called", async () => {
    const { fetch, calls } = captureFetch();
    const ok = await sendAlert({ severity: "warning", title: "t" }, { fetch });
    assert.equal(ok, false);
    assert.equal(calls.length, 0);
  });

  test("with a webhook → posts the formatted payload, returns true", async () => {
    const { fetch, calls } = captureFetch();
    const ok = await sendAlert({ severity: "warning", title: "db: quota pressure" }, { webhookUrl: WEBHOOK, fetch });
    assert.equal(ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, WEBHOOK);
    assert.match((calls[0].body as { text: string }).text, /db: quota pressure/);
  });

  test("reads ALERT_WEBHOOK_URL from env when no override is given", async () => {
    process.env.ALERT_WEBHOOK_URL = WEBHOOK;
    const { fetch, calls } = captureFetch();
    await sendAlert({ severity: "info", title: "t" }, { fetch });
    assert.equal(calls.length, 1);
  });

  test("never throws: a failing fetch returns false", async () => {
    const fetch = (async () => {
      throw new Error("network down");
    }) as unknown as typeof globalThis.fetch;
    const ok = await sendAlert({ severity: "critical", title: "t" }, { webhookUrl: WEBHOOK, fetch });
    assert.equal(ok, false);
  });

  test("a non-2xx webhook response returns false", async () => {
    const fetch = (async () => ({ ok: false }) as Response) as unknown as typeof globalThis.fetch;
    const ok = await sendAlert({ severity: "critical", title: "t" }, { webhookUrl: WEBHOOK, fetch });
    assert.equal(ok, false);
  });
});

describe("C-112 · condition helpers", () => {
  test("alertCrankFailure posts a critical alert with the jobId", async () => {
    const { fetch, calls } = captureFetch();
    await alertCrankFailure("job-123", "tx reverted: 0x1771", { webhookUrl: WEBHOOK, fetch });
    assert.equal(calls.length, 1);
    const text = (calls[0].body as { text: string }).text;
    assert.match(text, /CRITICAL/);
    assert.match(text, /jobId=job-123/);
  });

  test("alertRpcDown posts a critical alert with the endpoint count", async () => {
    const { fetch, calls } = captureFetch();
    await alertRpcDown(3, "503 from all", { webhookUrl: WEBHOOK, fetch });
    const text = (calls[0].body as { text: string }).text;
    assert.match(text, /CRITICAL/);
    assert.match(text, /rpc: all endpoints failing/);
    assert.match(text, /endpoints=3/);
  });

  test("alertDbQuota posts a warning with metric/value/threshold", async () => {
    const { fetch, calls } = captureFetch();
    await alertDbQuota("rows", 950000, 1000000, { webhookUrl: WEBHOOK, fetch });
    const text = (calls[0].body as { text: string }).text;
    assert.match(text, /WARNING/);
    assert.match(text, /metric=rows/);
    assert.match(text, /value=950000/);
    assert.match(text, /threshold=1000000/);
  });

  test("alertDisputeSpike posts a warning with count/window", async () => {
    const { fetch, calls } = captureFetch();
    await alertDisputeSpike(8, 10, { webhookUrl: WEBHOOK, fetch });
    const text = (calls[0].body as { text: string }).text;
    assert.match(text, /WARNING/);
    assert.match(text, /disputes: spike detected/);
    assert.match(text, /count=8/);
    assert.match(text, /windowMin=10/);
  });
});
