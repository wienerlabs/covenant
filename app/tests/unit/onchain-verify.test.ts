/**
 * Unit tests for lib/onchain-verify (C-011 / C-012b / C-021).
 *
 * Run with:  npx tsx --test tests/unit/onchain-verify.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  checkCreateJob,
  checkAcceptJob,
  reconcileJobRow,
  SYSTEM_ZERO_PUBKEY,
  type EscrowView,
} from "../../lib/onchain-verify";

const USDC = "F7RYRqCy8uWYxjxrXVhU3iUCRwa9bKBUTkGKktpyYueQ";
const OTHER_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function escrow(over: Partial<EscrowView> = {}): EscrowView {
  return {
    poster: "PosterWallet",
    taker: "TakerWallet",
    tokenMint: USDC,
    amount: 5,
    amountAtomic: 5_000_000n,
    specHashHex: "abc123",
    status: "Open",
    ...over,
  };
}

describe("checkCreateJob (C-011)", () => {
  const expect = {
    poster: "PosterWallet",
    specHashHex: "abc123",
    minAmountAtomic: 5_000_000n,
    mint: USDC,
  };

  test("accepts a matching, fully-funded escrow", () => {
    assert.deepEqual(checkCreateJob(escrow(), expect), { ok: true });
  });

  test("accepts an over-funded escrow", () => {
    assert.equal(checkCreateJob(escrow({ amountAtomic: 6_000_000n }), expect).ok, true);
  });

  test("rejects when the PDA was not found", () => {
    const r = checkCreateJob(null, expect);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /not found/);
  });

  test("rejects a poster mismatch", () => {
    const r = checkCreateJob(escrow({ poster: "Attacker" }), expect);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /poster mismatch/);
  });

  test("rejects a spec_hash mismatch", () => {
    const r = checkCreateJob(escrow({ specHashHex: "deadbeef" }), expect);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /spec_hash/);
  });

  test("rejects the wrong mint (forged-token escrow)", () => {
    const r = checkCreateJob(escrow({ tokenMint: OTHER_MINT }), expect);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /wrong mint/);
  });

  test("rejects an under-funded escrow", () => {
    const r = checkCreateJob(escrow({ amountAtomic: 4_999_999n }), expect);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /under-funded/);
  });
});

describe("checkAcceptJob (C-012b)", () => {
  test("accepts when taker == submitter and status Accepted", () => {
    assert.deepEqual(
      checkAcceptJob(escrow({ taker: "Alice", status: "Accepted" }), "Alice"),
      { ok: true },
    );
  });

  test("rejects a mismatched submitter", () => {
    const r = checkAcceptJob(escrow({ taker: "Alice", status: "Accepted" }), "Mallory");
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /does not match submitter/);
  });

  test("rejects when the on-chain status is not Accepted", () => {
    const r = checkAcceptJob(escrow({ taker: "Alice", status: "Open" }), "Alice");
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /expected 'Accepted'/);
  });

  test("rejects when the escrow is missing", () => {
    assert.equal(checkAcceptJob(null, "Alice").ok, false);
  });
});

describe("reconcileJobRow (C-021)", () => {
  test("reports no drift when in sync", () => {
    const r = reconcileJobRow(
      { status: "Accepted", takerWallet: "Alice", amount: 5 },
      escrow({ status: "Accepted", taker: "Alice", amount: 5 }),
    );
    assert.equal(r.drifted, false);
    assert.deepEqual(r.updates, {});
  });

  test("heals a corrupted status from chain", () => {
    const r = reconcileJobRow(
      { status: "Open", takerWallet: "Alice", amount: 5 },
      escrow({ status: "Finalized", taker: "Alice", amount: 5 }),
    );
    assert.equal(r.drifted, true);
    assert.equal(r.updates.status, "Finalized");
  });

  test("heals a missing taker from chain", () => {
    const r = reconcileJobRow(
      { status: "Accepted", takerWallet: null, amount: 5 },
      escrow({ status: "Accepted", taker: "Bob", amount: 5 }),
    );
    assert.equal(r.updates.takerWallet, "Bob");
  });

  test("does not set taker when the chain has none (zero pubkey)", () => {
    const r = reconcileJobRow(
      { status: "Open", takerWallet: null, amount: 5 },
      escrow({ status: "Open", taker: SYSTEM_ZERO_PUBKEY, amount: 5 }),
    );
    assert.equal(r.drifted, false);
    assert.equal(r.updates.takerWallet, undefined);
  });

  test("heals a drifted amount", () => {
    const r = reconcileJobRow(
      { status: "Open", takerWallet: null, amount: 99 },
      escrow({ status: "Open", taker: SYSTEM_ZERO_PUBKEY, amount: 5 }),
    );
    assert.equal(r.updates.amount, 5);
  });

  test("heals multiple drifted fields at once", () => {
    const r = reconcileJobRow(
      { status: "Open", takerWallet: null, amount: 1 },
      escrow({ status: "Delivered", taker: "Carol", amount: 5 }),
    );
    assert.deepEqual(r.updates, { status: "Delivered", takerWallet: "Carol", amount: 5 });
  });
});
