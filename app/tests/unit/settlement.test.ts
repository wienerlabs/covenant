/**
 * Unit tests for lib/settlement + the sendMarkerTransaction quarantine (C-003).
 *
 * Run with:  npx tsx --test tests/unit/settlement.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  settlementMode,
  isOnchainMode,
  assertSimulatedAllowed,
  covenantEnv,
  blockSimulatedRouteIfOnchain,
} from "../../lib/settlement";
import { sendMarkerTransaction } from "../../lib/solana";

const ORIG = process.env.SETTLEMENT_MODE;
const ORIG_ENV = process.env.COVENANT_ENV;
function restore() {
  if (ORIG === undefined) delete process.env.SETTLEMENT_MODE;
  else process.env.SETTLEMENT_MODE = ORIG;
  if (ORIG_ENV === undefined) delete process.env.COVENANT_ENV;
  else process.env.COVENANT_ENV = ORIG_ENV;
}

describe("settlementMode", () => {
  test("defaults to simulated when unset", () => {
    delete process.env.SETTLEMENT_MODE;
    assert.equal(settlementMode(), "simulated");
    assert.equal(isOnchainMode(), false);
    restore();
  });

  test("reads onchain from the env", () => {
    process.env.SETTLEMENT_MODE = "onchain";
    assert.equal(settlementMode(), "onchain");
    assert.equal(isOnchainMode(), true);
    restore();
  });

  test("treats any other value as simulated", () => {
    process.env.SETTLEMENT_MODE = "weird";
    assert.equal(settlementMode(), "simulated");
    restore();
  });
});

describe("assertSimulatedAllowed", () => {
  test("is a no-op in simulated mode", () => {
    delete process.env.SETTLEMENT_MODE;
    assert.doesNotThrow(() => assertSimulatedAllowed("marker"));
    restore();
  });

  test("throws in onchain mode", () => {
    process.env.SETTLEMENT_MODE = "onchain";
    assert.throws(() => assertSimulatedAllowed("marker"), /onchain/);
    restore();
  });
});

describe("sendMarkerTransaction quarantine (C-003)", () => {
  test("throws in onchain mode, before any Solana call", async () => {
    process.env.SETTLEMENT_MODE = "onchain";
    await assert.rejects(
      sendMarkerTransaction("test:job"),
      /SETTLEMENT_MODE=onchain/,
    );
    restore();
  });
});

describe("covenantEnv (C-002)", () => {
  test("defaults to devnet", () => {
    delete process.env.COVENANT_ENV;
    assert.equal(covenantEnv(), "devnet");
    restore();
  });
  test("reads mainnet from the env", () => {
    process.env.COVENANT_ENV = "mainnet";
    assert.equal(covenantEnv(), "mainnet");
    restore();
  });
});

describe("blockSimulatedRouteIfOnchain (C-002)", () => {
  test("returns null in simulated mode (route proceeds)", () => {
    delete process.env.SETTLEMENT_MODE;
    assert.equal(blockSimulatedRouteIfOnchain("POST /api/jobs"), null);
    restore();
  });

  test("returns a 501 response in onchain mode", async () => {
    process.env.SETTLEMENT_MODE = "onchain";
    const res = blockSimulatedRouteIfOnchain("POST /api/jobs");
    assert.ok(res);
    assert.equal(res!.status, 501);
    const body = (await res!.json()) as { error: string; code: string };
    assert.equal(body.code, "simulated_path_disabled");
    assert.match(body.error, /disabled while SETTLEMENT_MODE=onchain/);
    restore();
  });
});
