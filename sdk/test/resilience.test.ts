/**
 * C-122 — unit tests for typed errors + RPC retry/backoff.
 *
 * Run with:  npx tsx --test test/resilience.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  CovenantError,
  CovenantRpcError,
  CovenantProgramError,
  CovenantValidationError,
  classifyError,
  isRetriableError,
} from "../src/errors";
import { backoffDelayMs, withRetry } from "../src/retry";

describe("C-122 · error classes", () => {
  test("instanceof chain + names", () => {
    const rpc = new CovenantRpcError("x");
    assert.ok(rpc instanceof CovenantError);
    assert.equal(rpc.name, "CovenantRpcError");
    const prog = new CovenantProgramError("y", { code: 6000, logs: ["a"] });
    assert.equal(prog.code, 6000);
    assert.deepEqual(prog.logs, ["a"]);
    assert.ok(prog instanceof CovenantError);
  });
});

describe("C-122 · isRetriableError", () => {
  for (const msg of [
    "blockhash not found",
    "Node is behind by 42 slots",
    "429 Too Many Requests",
    "503 Service Unavailable",
    "request timed out",
    "fetch failed",
    "Transaction was not confirmed in 30s",
  ]) {
    test(`retriable: "${msg}"`, () => assert.equal(isRetriableError(new Error(msg)), true));
  }
  test("CovenantRpcError is retriable", () => assert.equal(isRetriableError(new CovenantRpcError("x")), true));
  test("program error is NOT retriable", () =>
    assert.equal(isRetriableError(new CovenantProgramError("x", { code: 6000 })), false));
  test("validation error is NOT retriable", () =>
    assert.equal(isRetriableError(new CovenantValidationError("x")), false));
  test("anchor-shaped program error is NOT retriable", () =>
    assert.equal(isRetriableError({ error: { errorCode: { code: "ConstraintSeeds", number: 2006 } } }), false));
  test("plain logic error is NOT retriable", () =>
    assert.equal(isRetriableError(new Error("invalid argument: amount must be > 0")), false));
});

describe("C-122 · classifyError", () => {
  test("anchor program error → CovenantProgramError with code + logs", () => {
    const raw = { error: { errorCode: { code: "Unauthorized", number: 6001 } }, logs: ["log a", "log b"] };
    const out = classifyError(raw);
    assert.ok(out instanceof CovenantProgramError);
    assert.equal((out as CovenantProgramError).code, "Unauthorized");
    assert.deepEqual((out as CovenantProgramError).logs, ["log a", "log b"]);
  });
  test("SendTransactionError custom instruction error → program error", () => {
    const raw = { transactionError: { InstructionError: [0, { Custom: 6002 }] } };
    const out = classifyError(raw);
    assert.ok(out instanceof CovenantProgramError);
    assert.equal((out as CovenantProgramError).code, 6002);
  });
  test("transient RPC message → CovenantRpcError", () => {
    assert.ok(classifyError(new Error("blockhash not found")) instanceof CovenantRpcError);
  });
  test("unknown error → CovenantError (base)", () => {
    const out = classifyError(new Error("something weird"));
    assert.ok(out instanceof CovenantError);
    assert.equal(out instanceof CovenantRpcError, false);
    assert.equal(out instanceof CovenantProgramError, false);
  });
  test("already typed → returned as-is (idempotent)", () => {
    const e = new CovenantValidationError("bad");
    assert.equal(classifyError(e), e);
  });
});

describe("C-122 · backoffDelayMs", () => {
  test("exponential, no jitter", () => {
    const o = { baseDelayMs: 100, maxDelayMs: 10000, jitter: false };
    assert.equal(backoffDelayMs(0, o), 100);
    assert.equal(backoffDelayMs(1, o), 200);
    assert.equal(backoffDelayMs(2, o), 400);
    assert.equal(backoffDelayMs(3, o), 800);
  });
  test("capped at maxDelayMs", () => {
    assert.equal(backoffDelayMs(20, { baseDelayMs: 100, maxDelayMs: 1000, jitter: false }), 1000);
  });
  test("jitter scales the capped delay by random()", () => {
    assert.equal(backoffDelayMs(1, { baseDelayMs: 100, maxDelayMs: 10000, jitter: true, random: () => 0.5 }), 100);
  });
});

describe("C-122 · withRetry", () => {
  const noSleep = { sleep: async () => {}, jitter: false };

  test("succeeds on first try → one call, no retry", async () => {
    let calls = 0;
    const r = await withRetry(async () => (calls++, "ok"), noSleep);
    assert.equal(r, "ok");
    assert.equal(calls, 1);
  });

  test("retries a retriable error then succeeds", async () => {
    let calls = 0;
    const r = await withRetry(async () => {
      calls++;
      if (calls < 3) throw new Error("blockhash not found");
      return "ok";
    }, { ...noSleep, maxRetries: 5 });
    assert.equal(r, "ok");
    assert.equal(calls, 3);
  });

  test("gives up after maxRetries and throws the last error", async () => {
    let calls = 0;
    await assert.rejects(
      withRetry(async () => {
        calls++;
        throw new Error("429 Too Many Requests");
      }, { ...noSleep, maxRetries: 2 }),
      /429/,
    );
    assert.equal(calls, 3); // first try + 2 retries
  });

  test("does NOT retry a non-retriable error → one call", async () => {
    let calls = 0;
    await assert.rejects(
      withRetry(async () => {
        calls++;
        throw new CovenantProgramError("rejected", { code: 6000 });
      }, { ...noSleep, maxRetries: 5 }),
      CovenantProgramError,
    );
    assert.equal(calls, 1);
  });
});
