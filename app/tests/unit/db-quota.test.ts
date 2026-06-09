/**
 * Unit tests for the C-115 DB quota guardrail (lib/db-quota).
 *
 * Run with:  npx tsx --test tests/unit/db-quota.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  quotaUsageRatio,
  quotaLevel,
  dbQuotaConfigFromEnv,
  checkDbQuota,
} from "../../lib/db-quota";

describe("C-115 · quotaUsageRatio (pure)", () => {
  test("used/limit", () => assert.equal(quotaUsageRatio(800, 1000), 0.8));
  test("over 100% is allowed (>1)", () => assert.equal(quotaUsageRatio(1500, 1000), 1.5));
  test("unknown limit (<=0) → 0", () => {
    assert.equal(quotaUsageRatio(800, 0), 0);
    assert.equal(quotaUsageRatio(800, -5), 0);
  });
  test("non-finite inputs → 0", () => {
    assert.equal(quotaUsageRatio(NaN, 1000), 0);
    assert.equal(quotaUsageRatio(800, Infinity), 0);
  });
});

describe("C-115 · quotaLevel (pure)", () => {
  test("below warn → ok", () => assert.equal(quotaLevel(0.5, 0.8, 0.95), "ok"));
  test("at warn → warn", () => assert.equal(quotaLevel(0.8, 0.8, 0.95), "warn"));
  test("between warn and crit → warn", () => assert.equal(quotaLevel(0.9, 0.8, 0.95), "warn"));
  test("at/over crit → critical", () => {
    assert.equal(quotaLevel(0.95, 0.8, 0.95), "critical");
    assert.equal(quotaLevel(1.2, 0.8, 0.95), "critical");
  });
});

describe("C-115 · dbQuotaConfigFromEnv", () => {
  test("no limit → null (opt-in off)", () => {
    assert.equal(dbQuotaConfigFromEnv({}), null);
    assert.equal(dbQuotaConfigFromEnv({ DB_QUOTA_LIMIT_BYTES: "0" }), null);
    assert.equal(dbQuotaConfigFromEnv({ DB_QUOTA_LIMIT_BYTES: "abc" }), null);
  });
  test("limit set → config with default ratios", () => {
    const c = dbQuotaConfigFromEnv({ DB_QUOTA_LIMIT_BYTES: "1000000" });
    assert.deepEqual(c, { limitBytes: 1_000_000, warnRatio: 0.8, critRatio: 0.95 });
  });
  test("custom ratios parsed; out-of-range fall back", () => {
    const c = dbQuotaConfigFromEnv({
      DB_QUOTA_LIMIT_BYTES: "1000",
      DB_QUOTA_WARN_RATIO: "0.7",
      DB_QUOTA_CRIT_RATIO: "5", // invalid (>1) → default 0.95
    });
    assert.equal(c?.warnRatio, 0.7);
    assert.equal(c?.critRatio, 0.95);
  });
});

describe("C-115 · checkDbQuota", () => {
  const config = { limitBytes: 1000, warnRatio: 0.8, critRatio: 0.95 };

  test("unconfigured → no-op, no alert", async () => {
    let alertCalls = 0;
    const r = await checkDbQuota({
      getSizeBytes: async () => 999,
      config: null,
      alert: async () => (alertCalls++, true),
    });
    assert.equal(r.configured, false);
    assert.equal(r.alerted, false);
    assert.equal(alertCalls, 0);
  });

  test("under warn → no alert, level ok", async () => {
    let alertCalls = 0;
    const r = await checkDbQuota({
      getSizeBytes: async () => 500,
      config,
      alert: async () => (alertCalls++, true),
    });
    assert.equal(r.level, "ok");
    assert.equal(r.alerted, false);
    assert.equal(alertCalls, 0);
  });

  test("at/over warn → alerts with (used, limit)", async () => {
    const calls: Array<{ value: number; threshold: number }> = [];
    const r = await checkDbQuota({
      getSizeBytes: async () => 850,
      config,
      alert: async (_m, value, threshold) => (calls.push({ value, threshold }), true),
    });
    assert.equal(r.level, "warn");
    assert.equal(r.alerted, true);
    assert.deepEqual(calls, [{ value: 850, threshold: 1000 }]);
  });

  test("over crit → critical + alerts", async () => {
    let alerted = false;
    const r = await checkDbQuota({
      getSizeBytes: async () => 990,
      config,
      alert: async () => ((alerted = true), true),
    });
    assert.equal(r.level, "critical");
    assert.equal(alerted, true);
  });

  test("probe failure → treated as 0, ok, never throws", async () => {
    const r = await checkDbQuota({
      getSizeBytes: async () => {
        throw new Error("db down");
      },
      config,
    });
    assert.equal(r.usedBytes, 0);
    assert.equal(r.level, "ok");
    assert.equal(r.alerted, false);
  });

  test("onResult observer receives the result", async () => {
    let seenLevel: string | null = null;
    await checkDbQuota({
      getSizeBytes: async () => 850,
      config,
      alert: async () => true,
      onResult: (res) => {
        seenLevel = res.level;
      },
    });
    assert.equal(seenLevel, "warn");
  });
});
