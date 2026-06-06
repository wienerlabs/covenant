/**
 * Integration tests for the x402 payment gate (C-039).
 *
 * Wires the real modules together — verifyPayment (lib/x402-server) with
 * the replay/idempotency decision and revenue reconciliation
 * (lib/x402-payments) — to exercise the full sequence a paid chat request
 * runs through: advertise a requirement, verify a real on-chain payment,
 * claim it once, replay it on a retry, reject the same payment reused for a
 * new prompt, and reconcile revenue to the verified payments.
 *
 * The durable store is simulated on top of the real `decidePaymentClaim`
 * so the cross-module data flow (verify → claim → finalize → replay) is
 * exercised without a database.
 *
 * Run with:  npx tsx --test tests/unit/x402-flow.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  verifyPayment,
  buildPaymentRequired,
  USDC_DEVNET_MINT,
  type TxMetaLike,
} from "../../lib/x402-server";
import {
  hashPaymentRequest,
  decidePaymentClaim,
  reconcileRevenue,
  type ConsumedPaymentRecord,
} from "../../lib/x402-payments";

const CREATOR = "AgentCreatorWallet1111111111111111111111111";
const PAYER = "UserPayerWallet11111111111111111111111111111";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
/** Deterministic 88-char base58 signature, varied by seed. */
function makeSig(seed: number, len = 88): string {
  let s = "";
  for (let i = 0; i < len; i++) s += B58[(i * 7 + seed) % B58.length];
  return s;
}

/** Base64 Payment-Signature envelope carrying a transaction signature. */
function envelope(transaction: string): string {
  const payload = { x402Version: 2, payload: { transaction } };
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64");
}

/** A confirmed tx moving `amountAtomic` of the canonical USDC PAYER→CREATOR. */
function transferMeta(amountAtomic: bigint): TxMetaLike {
  const pre = 1_000_000n;
  return {
    err: null,
    meta: {
      preTokenBalances: [
        { accountIndex: 1, mint: USDC_DEVNET_MINT, owner: PAYER, uiTokenAmount: { amount: pre.toString() } },
        { accountIndex: 2, mint: USDC_DEVNET_MINT, owner: CREATOR, uiTokenAmount: { amount: "0" } },
      ],
      postTokenBalances: [
        { accountIndex: 1, mint: USDC_DEVNET_MINT, owner: PAYER, uiTokenAmount: { amount: (pre - amountAtomic).toString() } },
        { accountIndex: 2, mint: USDC_DEVNET_MINT, owner: CREATOR, uiTokenAmount: { amount: amountAtomic.toString() } },
      ],
    },
  };
}

/**
 * Simulated durable consumed-payment store, built on the real
 * `decidePaymentClaim`, mirroring claimPayment/finalizePayment so the gate
 * sequence integrates without a database.
 */
function makeStore() {
  const rows = new Map<string, ConsumedPaymentRecord & { amountAtomic: string }>();
  return {
    claim(sig: string, requestHash: string, amountAtomic: string) {
      const existing = rows.get(sig) ?? null;
      const decision = decidePaymentClaim(existing, requestHash);
      if (decision.kind === "fresh") {
        rows.set(sig, { requestHash, responseBody: null, responseCode: null, amountAtomic });
      }
      return decision;
    },
    finalize(sig: string, body: string, code: number) {
      const r = rows.get(sig);
      if (r) {
        r.responseBody = body;
        r.responseCode = code;
      }
    },
    /** Atomic amounts of payments that were served (finalized). */
    servedAmounts(): string[] {
      return [...rows.values()]
        .filter((r) => r.responseBody != null)
        .map((r) => r.amountAtomic);
    },
  };
}

describe("x402 gate flow (C-039 integration)", () => {
  test("the advertised requirement and verification agree on the canonical mint", async () => {
    const pr = buildPaymentRequired("agent_1", "Poet", 0.05, CREATOR);
    assert.equal(pr.accepts[0].asset, USDC_DEVNET_MINT);
    assert.equal(pr.accepts[0].amount, "50000");
    assert.equal(pr.accepts[0].payTo, CREATOR);
    assert.equal(pr.accepts[0].scheme, "exact");

    const v = await verifyPayment(envelope(makeSig(1)), pr, {
      fetchTransaction: async () => transferMeta(50000n),
    });
    assert.equal(v.valid, true);
    assert.equal(v.payer, PAYER);
    assert.equal(v.amountAtomic, "50000");
  });

  test("verify → claim once → retry replays the same response, one charge", async () => {
    const pr = buildPaymentRequired("agent_1", "Poet", 0.05, CREATOR);
    const header = envelope(makeSig(2));
    const store = makeStore();
    const reqHash = hashPaymentRequest("agent_1", "write me a haiku");

    // First paid request: verify, claim, serve, finalize.
    const v1 = await verifyPayment(header, pr, { fetchTransaction: async () => transferMeta(50000n) });
    assert.equal(v1.valid, true);
    const first = store.claim(v1.txHash, reqHash, v1.amountAtomic ?? "0");
    assert.equal(first.kind, "fresh");
    const body = JSON.stringify({ response: "an old silent pond" });
    store.finalize(v1.txHash, body, 200);

    // Network retry: identical payment + prompt replays the cached body.
    const v2 = await verifyPayment(header, pr, { fetchTransaction: async () => transferMeta(50000n) });
    const retry = store.claim(v2.txHash, reqHash, v2.amountAtomic ?? "0");
    assert.deepEqual(retry, { kind: "replay", body, code: 200 });

    // One charge: revenue (the single finalized payment) reconciles to chain.
    const revenue = [Number(v1.amountAtomic) / 1_000_000];
    assert.equal(reconcileRevenue(revenue, store.servedAmounts()).reconciled, true);
  });

  test("the same payment reused for a different prompt is rejected as consumed", async () => {
    const pr = buildPaymentRequired("agent_1", "Poet", 0.05, CREATOR);
    const header = envelope(makeSig(3));
    const store = makeStore();

    const v = await verifyPayment(header, pr, { fetchTransaction: async () => transferMeta(50000n) });
    store.claim(v.txHash, hashPaymentRequest("agent_1", "prompt one"), v.amountAtomic ?? "0");
    store.finalize(v.txHash, "{}", 200);

    const attack = store.claim(
      v.txHash,
      hashPaymentRequest("agent_1", "a second, free prompt"),
      v.amountAtomic ?? "0",
    );
    assert.deepEqual(attack, { kind: "consumed" });
  });

  test("an underpaid transaction never reaches the store", async () => {
    const pr = buildPaymentRequired("agent_1", "Poet", 0.05, CREATOR); // requires 50000
    const store = makeStore();

    const v = await verifyPayment(envelope(makeSig(4)), pr, {
      fetchTransaction: async () => transferMeta(40000n),
    });
    assert.equal(v.valid, false);
    assert.match(v.reason ?? "", /underpayment/);
    // The gate would return 402 here; nothing is claimed or served.
    assert.deepEqual(store.servedAmounts(), []);
  });

  test("the facilitator path integrates the same way", async () => {
    const pr = buildPaymentRequired("agent_1", "Poet", 0.05, CREATOR);
    const store = makeStore();

    const v = await verifyPayment(envelope(makeSig(5)), pr, {
      verifyViaFacilitator: async () => ({ isValid: true, payer: PAYER, amountAtomic: "50000" }),
    });
    assert.equal(v.valid, true);
    const claim = store.claim(v.txHash, hashPaymentRequest("agent_1", "hi"), v.amountAtomic ?? "0");
    assert.equal(claim.kind, "fresh");
  });
});
