/**
 * C-085 — Covenant Credit market unit tests.
 *
 * Covers the server-side decision logic that drives the three credit
 * instructions (list_claim / buy_claim / cancel_claim) and the finalize
 * routing, **including the dispute-loss-after-buy path**:
 *   - parseClaimStatus       — decode the on-chain claim state machine.
 *   - resolveClaimBeneficiary — who finalize pays (taker vs claim buyer); the
 *                               guard that a lost dispute never pays the buyer.
 *   - deriveClaimPda/JobPda   — deterministic PDA addressing.
 *
 * Full on-chain instruction coverage (revert paths on localnet) is C-048's
 * scope; this locks in the server logic that the credit market depends on, with
 * no live chain required.
 *
 * Run with:  npx tsx --test tests/unit/credit-market.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PublicKey } from "@solana/web3.js";
import {
  parseClaimStatus,
  resolveClaimBeneficiary,
  deriveJobPda,
  deriveClaimPda,
  type ClaimStatus,
} from "../../lib/credit-server";

const taker = PublicKey.unique();
const buyer = PublicKey.unique();

function listing(status: ClaimStatus, buyerWallet: string | null) {
  return { status, buyer: buyerWallet };
}

describe("C-085 · parseClaimStatus (claim state decoding)", () => {
  test("maps each Anchor enum variant to its ClaimStatus", () => {
    assert.equal(parseClaimStatus({ listed: {} }), "Listed");
    assert.equal(parseClaimStatus({ bought: {} }), "Bought");
    assert.equal(parseClaimStatus({ cancelled: {} }), "Cancelled");
    assert.equal(parseClaimStatus({ settled: {} }), "Settled");
  });

  test("null / malformed / unknown variants → Unknown", () => {
    assert.equal(parseClaimStatus(null), "Unknown");
    assert.equal(parseClaimStatus(undefined), "Unknown");
    assert.equal(parseClaimStatus({}), "Unknown");
    assert.equal(parseClaimStatus({ weird: {} }), "Unknown");
    assert.equal(parseClaimStatus("listed"), "Unknown");
  });
});

describe("C-085 · resolveClaimBeneficiary (finalize routing)", () => {
  test("a Bought claim with a buyer routes proceeds to the buyer", () => {
    const r = resolveClaimBeneficiary(listing("Bought", buyer.toBase58()), taker);
    assert.equal(r.routedToBuyer, true);
    assert.equal(r.buyer, buyer.toBase58());
    assert.equal(r.beneficiary.toBase58(), buyer.toBase58());
  });

  test("Listed / Cancelled / Settled claims route to the taker", () => {
    for (const status of ["Listed", "Cancelled", "Settled"] as ClaimStatus[]) {
      const r = resolveClaimBeneficiary(listing(status, buyer.toBase58()), taker);
      assert.equal(r.routedToBuyer, false, status);
      assert.equal(r.buyer, null, status);
      assert.equal(r.beneficiary.toBase58(), taker.toBase58(), status);
    }
  });

  test("no listing at all routes to the taker", () => {
    const r = resolveClaimBeneficiary(null, taker);
    assert.equal(r.routedToBuyer, false);
    assert.equal(r.beneficiary.toBase58(), taker.toBase58());
  });

  test("a Bought claim with NO buyer (corrupt) defensively routes to the taker", () => {
    const r = resolveClaimBeneficiary(listing("Bought", null), taker);
    assert.equal(r.routedToBuyer, false);
    assert.equal(r.beneficiary.toBase58(), taker.toBase58());
  });

  test("dispute-loss-after-buy: only a Bought status ever pays the buyer", () => {
    // A job that loses a dispute ends `Resolved` (refunded to poster), never
    // `Finalized`, so finalizeWithClaim never runs for it. We encode that
    // safety property here: every non-Bought status keeps proceeds away from
    // the buyer — the credit buyer carries the loss, not the protocol.
    const nonBought: ClaimStatus[] = ["Listed", "Cancelled", "Settled", "Unknown"];
    for (const status of nonBought) {
      assert.equal(
        resolveClaimBeneficiary(listing(status, buyer.toBase58()), taker).routedToBuyer,
        false,
        status,
      );
    }
  });
});

describe("C-085 · PDA derivation is deterministic and distinct", () => {
  const poster = PublicKey.unique();
  const specA = Buffer.alloc(32, 1);
  const specB = Buffer.alloc(32, 2);

  test("deriveJobPda is a pure function of (poster, specHash)", () => {
    const [a1] = deriveJobPda(poster, specA);
    const [a2] = deriveJobPda(poster, specA);
    const [b] = deriveJobPda(poster, specB);
    assert.equal(a1.toBase58(), a2.toBase58()); // deterministic
    assert.notEqual(a1.toBase58(), b.toBase58()); // distinct spec → distinct job
  });

  test("deriveClaimPda is deterministic per job and differs across jobs", () => {
    const [jobA] = deriveJobPda(poster, specA);
    const [jobB] = deriveJobPda(poster, specB);
    const [claimA1] = deriveClaimPda(jobA);
    const [claimA2] = deriveClaimPda(jobA);
    const [claimB] = deriveClaimPda(jobB);
    assert.equal(claimA1.toBase58(), claimA2.toBase58());
    assert.notEqual(claimA1.toBase58(), claimB.toBase58());
  });
});
