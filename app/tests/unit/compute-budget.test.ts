/**
 * Unit tests for lib/compute-budget (C-025).
 *
 * Run with:  npx tsx --test tests/unit/compute-budget.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ComputeBudgetProgram } from "@solana/web3.js";
import {
  computeBudgetInstructions,
  computeUnitLimit,
  priorityFeeMicroLamports,
  DEFAULT_COMPUTE_UNIT_LIMIT,
  DEFAULT_PRIORITY_FEE_MICROLAMPORTS,
} from "../../lib/compute-budget";

describe("computeBudgetInstructions", () => {
  test("returns SetComputeUnitLimit + SetComputeUnitPrice for the ComputeBudget program", () => {
    const ixs = computeBudgetInstructions({ units: 250_000, microLamports: 5_000 });
    assert.equal(ixs.length, 2);
    for (const ix of ixs) {
      assert.ok(ix.programId.equals(ComputeBudgetProgram.programId));
    }
    // Instruction discriminators: 2 = SetComputeUnitLimit, 3 = SetComputeUnitPrice.
    assert.equal(ixs[0].data[0], 2);
    assert.equal(ixs[1].data[0], 3);
    // The encoded params round-trip.
    assert.equal(ixs[0].data.readUInt32LE(1), 250_000);
    assert.equal(ixs[1].data.readBigUInt64LE(1), 5_000n);
  });

  test("uses the defaults when no opts are given", () => {
    delete process.env.COMPUTE_UNIT_LIMIT;
    delete process.env.PRIORITY_FEE_MICROLAMPORTS;
    const ixs = computeBudgetInstructions();
    assert.equal(ixs[0].data.readUInt32LE(1), DEFAULT_COMPUTE_UNIT_LIMIT);
    assert.equal(ixs[1].data.readBigUInt64LE(1), BigInt(DEFAULT_PRIORITY_FEE_MICROLAMPORTS));
  });
});

describe("env tunables", () => {
  const ORIG_LIMIT = process.env.COMPUTE_UNIT_LIMIT;
  const ORIG_FEE = process.env.PRIORITY_FEE_MICROLAMPORTS;
  function restore() {
    if (ORIG_LIMIT === undefined) delete process.env.COMPUTE_UNIT_LIMIT;
    else process.env.COMPUTE_UNIT_LIMIT = ORIG_LIMIT;
    if (ORIG_FEE === undefined) delete process.env.PRIORITY_FEE_MICROLAMPORTS;
    else process.env.PRIORITY_FEE_MICROLAMPORTS = ORIG_FEE;
  }

  test("reads COMPUTE_UNIT_LIMIT / PRIORITY_FEE_MICROLAMPORTS", () => {
    process.env.COMPUTE_UNIT_LIMIT = "300000";
    process.env.PRIORITY_FEE_MICROLAMPORTS = "2500";
    assert.equal(computeUnitLimit(), 300_000);
    assert.equal(priorityFeeMicroLamports(), 2_500);
    restore();
  });

  test("falls back to defaults on invalid env", () => {
    process.env.COMPUTE_UNIT_LIMIT = "not-a-number";
    process.env.PRIORITY_FEE_MICROLAMPORTS = "-5";
    assert.equal(computeUnitLimit(), DEFAULT_COMPUTE_UNIT_LIMIT);
    assert.equal(priorityFeeMicroLamports(), DEFAULT_PRIORITY_FEE_MICROLAMPORTS);
    restore();
  });
});
