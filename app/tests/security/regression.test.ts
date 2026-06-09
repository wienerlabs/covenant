/**
 * C-139 — security regression suite.
 *
 * Each test reproduces a class of exploit that was closed in M2 (x402 payment
 * bypasses) or M6 (auth gaps), and asserts it stays closed. If someone reopens
 * a hole — accepts an unverified payment, drops the admin fail-closed default,
 * un-blocks an SSRF target — the corresponding test goes red.
 *
 * Pure library-level assertions (no DB / no network), so they run fast and
 * deterministically alongside the unit suite.
 *
 * Run with:  npx --yes tsx --test tests/security/*.test.ts
 */

import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";

import { constantTimeEqual } from "../../lib/secure-compare";
import { requireAdmin } from "../../lib/admin-auth";
import { verifyWalletSignature } from "../../lib/wallet-auth";
import { validatePaymentSchema, verifyTransfer } from "../../lib/x402-server";
import { isBlockedIp, checkUrlSync } from "../../lib/ssrf";
import { requireAuth } from "../../lib/require-auth";

/* ============================================================ *
 *  M2 — x402 payment bypasses (C-030 / C-031 / C-033)
 * ============================================================ */

describe("M2 · x402 — payment cannot be spoofed", () => {
  // Minimal accept descriptor; validatePaymentSchema only reads these fields.
  const accept = { scheme: "exact", network: "solana-devnet", asset: "MintAAA" } as unknown as Parameters<
    typeof validatePaymentSchema
  >[1];
  const parsed = (scheme: string, network: string, asset: string) =>
    ({ txSignature: "Sig1111", scheme, network, asset }) as unknown as Parameters<typeof validatePaymentSchema>[0];

  test("EXPLOIT C-033: wrong scheme/network/asset is rejected", () => {
    assert.ok(
      validatePaymentSchema(parsed("bogus", "solana-devnet", "MintAAA"), accept).some(
        (i) => i.field === "scheme",
      ),
    );
    assert.ok(
      validatePaymentSchema(parsed("exact", "ethereum", "MintAAA"), accept).some(
        (i) => i.field === "network",
      ),
    );
    assert.ok(
      validatePaymentSchema(parsed("exact", "solana-devnet", "WrongMint"), accept).some(
        (i) => i.field === "asset",
      ),
    );
  });

  test("a fully-matching schema has zero issues (no false positive)", () => {
    assert.equal(
      validatePaymentSchema(parsed("exact", "solana-devnet", "MintAAA"), accept).length,
      0,
    );
  });

  // ---- C-031: the recipient must actually receive the right mint + amount ----
  const RECIP = "RecipientWalletAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const OTHER = "AttackerWalletBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
  const PAYER = "PayerWalletCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";
  const MINT_A = "MintAAA";
  const MINT_B = "MintBBB";

  /** A transaction that moves `amount` atomic of `mint` from PAYER to RECIP. */
  function transferMeta(mint: string, amount: number) {
    return {
      preTokenBalances: [
        { accountIndex: 0, mint, owner: RECIP, uiTokenAmount: { amount: "0" } },
        { accountIndex: 1, mint, owner: PAYER, uiTokenAmount: { amount: String(amount) } },
      ],
      postTokenBalances: [
        { accountIndex: 0, mint, owner: RECIP, uiTokenAmount: { amount: String(amount) } },
        { accountIndex: 1, mint, owner: PAYER, uiTokenAmount: { amount: "0" } },
      ],
    };
  }

  test("a correct transfer verifies", () => {
    const r = verifyTransfer(transferMeta(MINT_A, 1000), { mint: MINT_A, payTo: RECIP, minAmountAtomic: 1000n });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.amountAtomic, 1000n);
  });

  test("EXPLOIT C-031: wrong recipient is rejected", () => {
    const r = verifyTransfer(transferMeta(MINT_A, 1000), { mint: MINT_A, payTo: OTHER, minAmountAtomic: 1000n });
    assert.equal(r.ok, false);
  });

  test("EXPLOIT C-031: wrong mint is rejected", () => {
    const r = verifyTransfer(transferMeta(MINT_A, 1000), { mint: MINT_B, payTo: RECIP, minAmountAtomic: 1000n });
    assert.equal(r.ok, false);
  });

  test("EXPLOIT C-031: underpayment is rejected", () => {
    const r = verifyTransfer(transferMeta(MINT_A, 1000), { mint: MINT_A, payTo: RECIP, minAmountAtomic: 2000n });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /underpay/i);
  });
});

/* ============================================================ *
 *  M6 — auth gaps (C-091 / C-093 / C-094 / C-095)
 * ============================================================ */

describe("M6 · admin endpoints are fail-closed (C-095)", () => {
  afterEach(() => {
    delete process.env.ADMIN_SECRET;
    delete process.env.CRON_SECRET;
  });

  test("EXPLOIT: no admin secret configured → denied (never open)", () => {
    delete process.env.ADMIN_SECRET;
    delete process.env.CRON_SECRET;
    const r = requireAdmin(new Request("http://x/api/admin", { headers: { authorization: "Bearer anything" } }));
    assert.equal(r.ok, false);
  });

  test("EXPLOIT: wrong bearer token → denied", () => {
    process.env.ADMIN_SECRET = "s3cret";
    const r = requireAdmin(new Request("http://x/api/admin", { headers: { authorization: "Bearer wrong" } }));
    assert.equal(r.ok, false);
  });

  test("correct bearer token → allowed", () => {
    process.env.ADMIN_SECRET = "s3cret";
    const r = requireAdmin(new Request("http://x/api/admin", { headers: { authorization: "Bearer s3cret" } }));
    assert.equal(r.ok, true);
  });
});

describe("M6 · wallet signature cannot be forged (wallet-auth)", () => {
  const base = { wallet: "Wallet1111", message: "covenant-auth", expectedMessage: "covenant-auth", ts: Date.now() };

  test("EXPLOIT: garbage signature is rejected", () => {
    const r = verifyWalletSignature({ ...base, signature: "not-a-real-signature" });
    assert.equal(r.ok, false);
  });

  test("missing fields are rejected", () => {
    assert.equal(verifyWalletSignature({ ...base, signature: "" }).ok, false);
    assert.equal(
      verifyWalletSignature({ wallet: "", signature: "x", message: "m", expectedMessage: "m", ts: Date.now() }).ok,
      false,
    );
    assert.equal(
      verifyWalletSignature({ wallet: "w", signature: "x", message: "m", expectedMessage: "m", ts: "" }).ok,
      false,
    );
  });
});

describe("M6 · constant-time secret comparison (C-094)", () => {
  test("equal strings compare equal", () => assert.equal(constantTimeEqual("abc123", "abc123"), true));
  test("EXPLOIT: a near-miss does not compare equal", () =>
    assert.equal(constantTimeEqual("abc123", "abc124"), false));
  test("length mismatch returns false without throwing", () => {
    assert.equal(constantTimeEqual("short", "muchlongersecret"), false);
    assert.equal(constantTimeEqual("", "x"), false);
  });
  test("empty vs empty is equal", () => assert.equal(constantTimeEqual("", ""), true));
});

describe("M6 · SSRF targets stay blocked (C-093)", () => {
  test("EXPLOIT: loopback / private / link-local IPs are blocked", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "169.254.169.254", "::1"]) {
      assert.equal(isBlockedIp(ip), true, `${ip} must be blocked`);
    }
  });
  test("a public IP is allowed", () => assert.equal(isBlockedIp("8.8.8.8"), false));
  test("EXPLOIT: internal URLs are rejected by checkUrlSync", () => {
    assert.equal(checkUrlSync("http://localhost/admin").ok, false);
    assert.equal(checkUrlSync("http://127.0.0.1:8899").ok, false);
    assert.equal(checkUrlSync("http://169.254.169.254/latest/meta-data").ok, false);
  });
});

describe("M6 · mutating routes require auth when enforced (C-091)", () => {
  afterEach(() => delete process.env.AUTH_ENFORCED);

  test("EXPLOIT: AUTH_ENFORCED + no credentials → rejected", async () => {
    process.env.AUTH_ENFORCED = "true";
    const res = await requireAuth(new Request("http://x/api/jobs", { method: "POST" }));
    assert.equal(res.ok, false);
  });

  test("AUTH_ENFORCED unset → no-op (does not break existing callers)", async () => {
    delete process.env.AUTH_ENFORCED;
    const res = await requireAuth(new Request("http://x/api/jobs", { method: "POST" }));
    assert.equal(res.ok, true);
  });
});
