/**
 * C-136 — Chaos test: RPC outage, DB blip, crank crash mid-settle.
 *
 * AC: "No double-pay, no stuck escrow; reconciler heals state."
 *
 * The real auto-release crank (M1: C-014/C-015) is not wired yet, so this
 * suite proves the *safety primitives* the crank must compose already uphold
 * the invariants under injected chaos:
 *
 *   - classifySolanaError (C-023) decides retry-vs-fail, so a transient RPC
 *     outage is retried (same signed tx) while an ambiguous/on-chain failure
 *     is NOT blindly resent → no double-pay.
 *   - reserveIdempotent  (idempotency) admits exactly one in-flight settle per
 *     key → no double-pay under a retry storm.
 *   - reconcileJobRow    (C-021) treats the chain as source of truth, so a
 *     crank that crashes after the tx lands but before the DB write is healed
 *     on the next pass → no stuck escrow.
 *
 * The `modelCrankSettle` harness below stands in for the future crank; every
 * safety DECISION inside it comes from the real primitives, not the harness.
 *
 * Run with:  npx tsx --test tests/unit/chaos.test.ts
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { classifySolanaError } from "../../lib/solana-errors";
import {
  reconcileJobRow,
  SYSTEM_ZERO_PUBKEY,
  type EscrowView,
} from "../../lib/onchain-verify";
import {
  reserveIdempotent,
  releaseIdempotent,
  clearIdempotency,
} from "../../lib/idempotency";

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

function escrow(over: Partial<EscrowView> = {}): EscrowView {
  return {
    poster: "Poster1111111111111111111111111111111111111",
    taker: SYSTEM_ZERO_PUBKEY,
    tokenMint: "F7RYRqCy8uWYxjxrXVhU3iUCRwa9bKBUTkGKktpyYueQ",
    amount: 100,
    amountAtomic: 100_000_000n,
    specHashHex: "ab".repeat(32),
    status: "Open",
    ...over,
  };
}

function dbRow(over: Partial<{ status: string; takerWallet: string; amount: number }> = {}) {
  return { status: "Open", takerWallet: "", amount: 100, ...over };
}

// A stand-in for the future auto-release crank. Its retry/no-double-pay logic
// is driven entirely by the real classifySolanaError + reserveIdempotent.
async function modelCrankSettle(opts: {
  key: string;
  sendTx: () => Promise<string>;
  maxAttempts?: number;
}): Promise<{ settled: boolean; attempts: number; signature?: string; aborted?: string }> {
  // No-double-pay: only one in-flight settle may own a given key.
  if (!reserveIdempotent(opts.key)) {
    return { settled: false, attempts: 0, aborted: "duplicate" };
  }
  const maxAttempts = opts.maxAttempts ?? 4;
  let attempts = 0;
  for (;;) {
    attempts++;
    try {
      const signature = await opts.sendTx();
      return { settled: true, attempts, signature };
    } catch (err) {
      const c = classifySolanaError(err);
      if (c.retryable && attempts < maxAttempts) continue;
      // Non-retryable or exhausted: abort WITHOUT claiming a settlement, and
      // free the key so a later deliberate run (or the reconciler) can act.
      releaseIdempotent(opts.key);
      return { settled: false, attempts, aborted: c.mode };
    }
  }
}

// ---------------------------------------------------------------------------

beforeEach(() => clearIdempotency());

describe("C-136 chaos · RPC outage classification (retry vs fail)", () => {
  test("transient RPC errors are retryable (resend the same signed tx)", () => {
    for (const msg of [
      "Server responded with 429 Too Many Requests",
      "RPC rate limit exceeded",
      "Blockhash not found",
      "block height exceeded",
      "TransactionExpiredBlockheightExceededError",
    ]) {
      assert.equal(classifySolanaError(new Error(msg)).retryable, true, msg);
    }
  });

  test("deterministic on-chain rejections are NOT retryable (no blind resend → no double-pay)", () => {
    for (const msg of [
      "custom program error: 0x1771",
      "Transaction simulation failed: Error processing Instruction 0",
      "InstructionError: [0, { Custom: 6001 }]",
      "insufficient lamports for rent",
    ]) {
      assert.equal(classifySolanaError(new Error(msg)).retryable, false, msg);
    }
  });

  test("an ambiguous failure defaults to NOT auto-retried — fail loud, let reconcile heal", () => {
    const c = classifySolanaError(new Error("totally unexpected socket explosion"));
    assert.equal(c.mode, "unknown");
    assert.equal(c.retryable, false);
  });
});

describe("C-136 chaos · crank crash mid-settle → reconciler heals (no stuck escrow)", () => {
  test("tx landed (chain=Finalized) but crash before DB write → reconcile heals status", () => {
    // The escrow settled on chain; the crank died before mirroring it.
    const r = reconcileJobRow(dbRow({ status: "Accepted" }), escrow({ status: "Finalized" }));
    assert.equal(r.drifted, true);
    assert.equal(r.updates.status, "Finalized");
  });

  test("accept landed on chain but DB missed the taker → reconcile heals takerWallet", () => {
    const taker = "Taker22222222222222222222222222222222222222";
    const r = reconcileJobRow(
      dbRow({ status: "Open", takerWallet: "" }),
      escrow({ status: "Accepted", taker }),
    );
    assert.equal(r.updates.status, "Accepted");
    assert.equal(r.updates.takerWallet, taker);
  });

  test("reconcile is idempotent: applying updates once converges, re-run shows no drift", () => {
    const chain = escrow({ status: "Finalized", taker: "Tk3333333333333333333333333333333333333333" });
    const stale = dbRow({ status: "Accepted", takerWallet: "" });

    const first = reconcileJobRow(stale, chain);
    assert.equal(first.drifted, true);

    // Apply the healing updates to the DB row...
    const healed = { ...stale, ...first.updates };
    // ...and re-running reconcile against the same chain now sees no drift
    // (healing mirrors state; it never issues a payment, so it can't double-pay).
    const second = reconcileJobRow(healed, chain);
    assert.equal(second.drifted, false);
    assert.deepEqual(second.updates, {});
  });

  test("an in-sync row is left untouched (no spurious writes)", () => {
    const chain = escrow({ status: "Finalized" });
    const r = reconcileJobRow(dbRow({ status: "Finalized" }), chain);
    assert.equal(r.drifted, false);
  });
});

describe("C-136 chaos · no double-pay under a retry storm", () => {
  test("reserveIdempotent admits exactly one in-flight settle per key", () => {
    assert.equal(reserveIdempotent("settle:jobA"), true); // first wins
    assert.equal(reserveIdempotent("settle:jobA"), false); // concurrent duplicate blocked
    releaseIdempotent("settle:jobA");
    assert.equal(reserveIdempotent("settle:jobA"), true); // after release, retry allowed
  });

  test("a rate-limited settle retries the SAME tx and settles exactly once", async () => {
    let calls = 0;
    let landed = 0;
    const res = await modelCrankSettle({
      key: "settle:jobB",
      sendTx: async () => {
        calls++;
        if (calls < 3) throw new Error("429 Too Many Requests");
        landed++;
        return "sigB";
      },
    });
    assert.equal(res.settled, true);
    assert.equal(res.attempts, 3); // two retries then success
    assert.equal(landed, 1); // settled exactly once — no double-pay
  });

  test("a concurrent second crank on the same job aborts as a duplicate", async () => {
    // First crank reserves and is mid-flight (sendTx hangs until we release).
    assert.equal(reserveIdempotent("settle:jobC"), true);
    const res = await modelCrankSettle({
      key: "settle:jobC",
      sendTx: async () => "should-not-run",
    });
    assert.equal(res.settled, false);
    assert.equal(res.aborted, "duplicate");
    assert.equal(res.attempts, 0); // never even tried to send → no double-pay
  });

  test("a non-retryable on-chain rejection aborts without settling (no double-pay)", async () => {
    let landed = 0;
    const res = await modelCrankSettle({
      key: "settle:jobD",
      sendTx: async () => {
        throw new Error("custom program error: 0x1771");
      },
    });
    assert.equal(res.settled, false);
    assert.equal(res.aborted, "tx_reverted");
    assert.equal(landed, 0);
    // key was released, so a deliberate future attempt is possible
    assert.equal(reserveIdempotent("settle:jobD"), true);
  });
});
