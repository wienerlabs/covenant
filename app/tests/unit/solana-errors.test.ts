/**
 * Unit tests for lib/solana-errors — failure-mode classifier (C-023).
 * Each failure mode has a test (the AC).
 *
 * Run with:  npx tsx --test tests/unit/solana-errors.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { classifySolanaError } from "../../lib/solana-errors";

describe("classifySolanaError", () => {
  test("blockhash expiry", () => {
    for (const e of [
      new Error("failed to send transaction: Blockhash not found"),
      new Error("block height exceeded"),
      new Error("TransactionExpiredBlockheightExceededError: ..."),
    ]) {
      const r = classifySolanaError(e);
      assert.equal(r.mode, "blockhash_expired");
      assert.equal(r.retryable, true);
    }
  });

  test("insufficient SOL for fees", () => {
    for (const e of [
      new Error("Attempt to debit an account but found no record of a prior credit."),
      new Error("Transfer: insufficient lamports 0, need 5000"),
      new Error("insufficient funds for rent"),
    ]) {
      const r = classifySolanaError(e);
      assert.equal(r.mode, "insufficient_sol", e.message);
      assert.equal(r.retryable, false);
    }
  });

  test("ATA not found", () => {
    for (const e of [
      new Error("TokenAccountNotFoundError"),
      new Error("could not find account"),
      new Error("Provided associated token account is invalid"),
    ]) {
      assert.equal(classifySolanaError(e).mode, "ata_not_found", e.message);
    }
  });

  test("simulation failed", () => {
    const r = classifySolanaError(
      new Error("Transaction simulation failed: Error processing Instruction 0"),
    );
    assert.equal(r.mode, "simulation_failed");
    assert.match(r.message, /No changes were made/);
  });

  test("rate limited (429)", () => {
    for (const e of [
      new Error("429 Too Many Requests"),
      new Error("server responded with rate limit exceeded"),
    ]) {
      const r = classifySolanaError(e);
      assert.equal(r.mode, "rate_limited");
      assert.equal(r.retryable, true);
    }
  });

  test("tx reverted on chain", () => {
    const r = classifySolanaError(new Error("Transaction reverted: custom program error: 0x1771"));
    assert.equal(r.mode, "tx_reverted");
  });

  test("unknown fallback", () => {
    const r = classifySolanaError(new Error("something totally unexpected"));
    assert.equal(r.mode, "unknown");
    assert.equal(r.retryable, false);
  });

  test("extracts detail from an error's .logs array", () => {
    const err = Object.assign(new Error("Transaction failed"), {
      logs: ["Program log: Instruction: Transfer", "Program log: insufficient lamports 0"],
    });
    assert.equal(classifySolanaError(err).mode, "insufficient_sol");
  });

  test("handles non-Error inputs without throwing", () => {
    assert.equal(classifySolanaError(null).mode, "unknown");
    assert.equal(classifySolanaError("429: too many requests").mode, "rate_limited");
    assert.equal(classifySolanaError({ weird: true }).mode, "unknown");
  });
});
