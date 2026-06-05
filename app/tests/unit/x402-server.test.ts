/**
 * Unit tests for lib/x402-server — real on-chain payment verification.
 *
 * Covers C-030 (no bypass), C-031 (amount/recipient/mint), C-033 (schema
 * + Solana scheme), C-034 (confirmed commitment / not-found rejects).
 *
 * Run with:  npx tsx --test tests/unit/x402-server.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isPlausibleTxSignature,
  parsePaymentSignature,
  validatePaymentSchema,
  summarizeCreditsToRecipient,
  verifyTransfer,
  verifyPayment,
  type PaymentRequired,
  type TxMetaLike,
} from "../../lib/x402-server";

/* ---- fixtures ---------------------------------------------------- */

const MINT = "F7RYRqCy8uWYxjxrXVhU3iUCRwa9bKBUTkGKktpyYueQ";
const OTHER_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const CREATOR = "Creator11111111111111111111111111111111111";
const PAYER = "Payer111111111111111111111111111111111111111";
const NET = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
/** Deterministic base58 string of `len` chars (a structurally-valid sig). */
function makeSig(len = 88): string {
  let s = "";
  for (let i = 0; i < len; i++) s += B58[(i * 7) % B58.length];
  return s;
}
const SIG = makeSig(88);

function reqFor(amount = "50000"): PaymentRequired {
  return {
    x402Version: 2,
    error: "Payment required",
    resource: { url: "/x", description: "d", mimeType: "application/json" },
    accepts: [
      {
        scheme: "exact",
        network: NET,
        asset: MINT,
        amount,
        payTo: CREATOR,
        maxTimeoutSeconds: 120,
      },
    ],
  };
}

/** Base64-encode the in-app Payment-Signature envelope. */
function envelope(
  transaction: string,
  accepted: { scheme?: string; network?: string; asset?: string } = {},
): string {
  const payload = { x402Version: 2, accepted, payload: { transaction } };
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64");
}

/** A tx that moves `amount` atomic of `mint` from `from` to `to`. */
function transferMeta(opts: {
  mint?: string;
  from?: string;
  to?: string;
  amount?: bigint;
  recipientPreExists?: boolean;
  err?: unknown;
}): TxMetaLike {
  const mint = opts.mint ?? MINT;
  const from = opts.from ?? PAYER;
  const to = opts.to ?? CREATOR;
  const amount = opts.amount ?? 50000n;
  const preFrom = 100000n;

  const pre: NonNullable<TxMetaLike["meta"]>["preTokenBalances"] = [
    { accountIndex: 1, mint, owner: from, uiTokenAmount: { amount: preFrom.toString() } },
  ];
  // Model an ATA that may or may not have existed before the transfer.
  if (opts.recipientPreExists !== false) {
    pre.push({ accountIndex: 2, mint, owner: to, uiTokenAmount: { amount: "0" } });
  }
  const post = [
    { accountIndex: 1, mint, owner: from, uiTokenAmount: { amount: (preFrom - amount).toString() } },
    { accountIndex: 2, mint, owner: to, uiTokenAmount: { amount: amount.toString() } },
  ];
  return { err: opts.err ?? null, meta: { preTokenBalances: pre, postTokenBalances: post } };
}

/** A fetch that fails the test if it is ever called. */
const rejectFetch = async (): Promise<TxMetaLike | null> => {
  throw new Error("RPC should not have been called");
};

/* ---- isPlausibleTxSignature (C-030) ------------------------------ */

describe("isPlausibleTxSignature", () => {
  test("accepts a base58 signature of the right length", () => {
    assert.equal(isPlausibleTxSignature(SIG), true);
  });
  test("rejects the legacy x402:<ts>:<wallet> bypass token", () => {
    assert.equal(isPlausibleTxSignature(`x402:${1700000000000}:${PAYER}`), false);
  });
  test("rejects arbitrary short strings (len>10 fallback class)", () => {
    assert.equal(isPlausibleTxSignature("abcdefghijklmnop"), false);
    assert.equal(isPlausibleTxSignature("anystring-longer-than-ten"), false);
  });
  test("rejects non-base58 characters", () => {
    assert.equal(isPlausibleTxSignature(makeSig(88).slice(0, 87) + "0"), false); // '0' not base58
    assert.equal(isPlausibleTxSignature(makeSig(88).slice(0, 87) + "+"), false);
  });
  test("rejects non-strings", () => {
    assert.equal(isPlausibleTxSignature(null), false);
    assert.equal(isPlausibleTxSignature(12345), false);
  });
});

/* ---- parsePaymentSignature (C-033) ------------------------------- */

describe("parsePaymentSignature", () => {
  test("parses the base64 in-app envelope", () => {
    const parsed = parsePaymentSignature(
      envelope(SIG, { scheme: "exact", network: NET, asset: MINT }),
    );
    assert.ok(parsed);
    assert.equal(parsed!.txSignature, SIG);
    assert.equal(parsed!.scheme, "exact");
    assert.equal(parsed!.network, NET);
    assert.equal(parsed!.asset, MINT);
  });

  test("parses a raw JSON standard payload", () => {
    const raw = JSON.stringify({
      x402Version: 2,
      scheme: "exact",
      network: NET,
      payload: { transaction: SIG },
    });
    const parsed = parsePaymentSignature(raw);
    assert.equal(parsed!.txSignature, SIG);
    assert.equal(parsed!.scheme, "exact");
  });

  test("parses a bare signature string", () => {
    const parsed = parsePaymentSignature(SIG);
    assert.equal(parsed!.txSignature, SIG);
    assert.equal(parsed!.scheme, undefined);
  });

  test("extracts the (fake) transaction from a wrapped bypass token", () => {
    const parsed = parsePaymentSignature(envelope("x402:123:wallet"));
    assert.equal(parsed!.txSignature, "x402:123:wallet");
  });

  test("returns null for empty / non-string headers", () => {
    assert.equal(parsePaymentSignature(""), null);
    assert.equal(parsePaymentSignature("   "), null);
    assert.equal(parsePaymentSignature(null), null);
    assert.equal(parsePaymentSignature(undefined), null);
  });
});

/* ---- validatePaymentSchema (C-033) ------------------------------- */

describe("validatePaymentSchema", () => {
  const accept = reqFor().accepts[0];

  test("passes when declared fields match the advertised ones", () => {
    assert.deepEqual(
      validatePaymentSchema({ txSignature: SIG, scheme: "exact", network: NET, asset: MINT }, accept),
      [],
    );
  });
  test("passes when fields are absent (minimal client)", () => {
    assert.deepEqual(validatePaymentSchema({ txSignature: SIG }, accept), []);
  });
  test("flags a wrong scheme", () => {
    const issues = validatePaymentSchema({ txSignature: SIG, scheme: "permit" }, accept);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].field, "scheme");
  });
  test("flags a wrong network and asset", () => {
    const issues = validatePaymentSchema(
      { txSignature: SIG, network: "solana:mainnet", asset: OTHER_MINT },
      accept,
    );
    assert.deepEqual(issues.map((i) => i.field).sort(), ["asset", "network"]);
  });
});

/* ---- summarizeCreditsToRecipient + verifyTransfer (C-031) -------- */

describe("summarizeCreditsToRecipient", () => {
  test("nets the credit to the recipient and identifies the payer", () => {
    const credits = summarizeCreditsToRecipient(transferMeta({}).meta, CREATOR);
    assert.equal(credits.get(MINT)?.amountAtomic, 50000n);
    assert.equal(credits.get(MINT)?.payer, PAYER);
  });
  test("handles a recipient ATA created in the same tx (no pre balance)", () => {
    const credits = summarizeCreditsToRecipient(
      transferMeta({ recipientPreExists: false }).meta,
      CREATOR,
    );
    assert.equal(credits.get(MINT)?.amountAtomic, 50000n);
  });
  test("returns nothing when the recipient received no tokens", () => {
    const credits = summarizeCreditsToRecipient(transferMeta({}).meta, "nobody");
    assert.equal(credits.size, 0);
  });
});

describe("verifyTransfer", () => {
  const req = { mint: MINT, payTo: CREATOR, minAmountAtomic: 50000n };

  test("accepts an exact payment", () => {
    const r = verifyTransfer(transferMeta({}).meta, req);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.amountAtomic, 50000n);
      assert.equal(r.payer, PAYER);
    }
  });
  test("accepts an overpayment", () => {
    const r = verifyTransfer(transferMeta({ amount: 60000n }).meta, req);
    assert.equal(r.ok, true);
  });
  test("rejects underpayment", () => {
    const r = verifyTransfer(transferMeta({ amount: 49999n }).meta, req);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /underpayment/);
  });
  test("rejects the wrong mint", () => {
    const r = verifyTransfer(transferMeta({ mint: OTHER_MINT }).meta, req);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /wrong mint/);
  });
  test("rejects the wrong recipient", () => {
    const r = verifyTransfer(transferMeta({ to: "someone-else" }).meta, req);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /no token transfer to the creator/);
  });
});

/* ---- verifyPayment orchestration (C-030/C-031/C-033/C-034) ------- */

describe("verifyPayment", () => {
  test("accepts a real, sufficient, confirmed payment", async () => {
    const res = await verifyPayment(
      envelope(SIG, { scheme: "exact", network: NET, asset: MINT }),
      reqFor("50000"),
      { fetchTransaction: async () => transferMeta({}) },
    );
    assert.equal(res.valid, true);
    assert.equal(res.txHash, SIG);
    assert.equal(res.payer, PAYER);
    assert.equal(res.amountAtomic, "50000");
  });

  test("C-030: rejects the x402:<ts>:<wallet> bypass without touching RPC", async () => {
    let called = false;
    const res = await verifyPayment(envelope(`x402:1700000000000:${PAYER}`), reqFor(), {
      fetchTransaction: async () => {
        called = true;
        return transferMeta({});
      },
    });
    assert.equal(res.valid, false);
    assert.match(res.reason ?? "", /not a valid Solana transaction signature/);
    assert.equal(called, false);
  });

  test("C-030: rejects an arbitrary >10-char string", async () => {
    const res = await verifyPayment("totally-bogus-payment-token", reqFor(), {
      fetchTransaction: rejectFetch,
    });
    assert.equal(res.valid, false);
  });

  test("C-033: rejects a wrong scheme before any RPC call", async () => {
    const res = await verifyPayment(envelope(SIG, { scheme: "permit" }), reqFor(), {
      fetchTransaction: rejectFetch,
    });
    assert.equal(res.valid, false);
    assert.match(res.reason ?? "", /unsupported payment scheme/);
  });

  test("C-034: rejects a tx not found at confirmed commitment", async () => {
    const res = await verifyPayment(envelope(SIG), reqFor(), {
      fetchTransaction: async () => null,
    });
    assert.equal(res.valid, false);
    assert.match(res.reason ?? "", /not found at confirmed/);
  });

  test("rejects a transaction that failed on chain", async () => {
    const res = await verifyPayment(envelope(SIG), reqFor(), {
      fetchTransaction: async () => transferMeta({ err: { InstructionError: [0, "Custom"] } }),
    });
    assert.equal(res.valid, false);
    assert.match(res.reason ?? "", /failed on chain/);
  });

  test("C-031: rejects underpayment", async () => {
    const res = await verifyPayment(envelope(SIG), reqFor("50001"), {
      fetchTransaction: async () => transferMeta({ amount: 50000n }),
    });
    assert.equal(res.valid, false);
    assert.match(res.reason ?? "", /underpayment/);
  });

  test("C-031: rejects the wrong mint", async () => {
    const res = await verifyPayment(envelope(SIG), reqFor(), {
      fetchTransaction: async () => transferMeta({ mint: OTHER_MINT }),
    });
    assert.equal(res.valid, false);
    assert.match(res.reason ?? "", /wrong mint/);
  });

  test("C-031: rejects the wrong recipient", async () => {
    const res = await verifyPayment(envelope(SIG), reqFor(), {
      fetchTransaction: async () => transferMeta({ to: "attacker-wallet" }),
    });
    assert.equal(res.valid, false);
    assert.match(res.reason ?? "", /no token transfer to the creator/);
  });
});
