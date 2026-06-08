/**
 * Unit tests for C-091 server-side mutating-endpoint auth (lib/require-auth).
 *
 * Run with:  npx tsx --test tests/unit/require-auth.test.ts
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import {
  requireAuth,
  authEnforced,
  canonicalAuthMessage,
  sha256Hex,
} from "../../lib/require-auth";

const PATH = "/api/faucet";
const ORIGIN = "https://covenant.run";

function signedRequest(opts: {
  kp: Keypair;
  method?: string;
  path?: string;
  rawBody?: string;
  ts?: number;
}) {
  const method = opts.method ?? "POST";
  const path = opts.path ?? PATH;
  const rawBody = opts.rawBody ?? "";
  const ts = opts.ts ?? Date.now();
  const message = canonicalAuthMessage({ method, path, ts, bodyHash: sha256Hex(rawBody) });
  const signature = bs58.encode(
    nacl.sign.detached(new TextEncoder().encode(message), opts.kp.secretKey),
  );
  const req = new Request(ORIGIN + path, {
    method,
    headers: {
      "x-wallet": opts.kp.publicKey.toBase58(),
      "x-signature": signature,
      "x-timestamp": String(ts),
    },
  });
  return { req, rawBody };
}

describe("canonicalAuthMessage / sha256Hex (pure)", () => {
  test("is deterministic and binds method, path, body, ts", () => {
    const base = { method: "POST", path: "/api/x", ts: 123, bodyHash: "ab" };
    assert.equal(canonicalAuthMessage(base), canonicalAuthMessage(base));
    assert.notEqual(canonicalAuthMessage(base), canonicalAuthMessage({ ...base, path: "/api/y" }));
    assert.notEqual(canonicalAuthMessage(base), canonicalAuthMessage({ ...base, bodyHash: "cd" }));
    assert.notEqual(canonicalAuthMessage(base), canonicalAuthMessage({ ...base, ts: 124 }));
  });
  test("sha256Hex is stable and differs by body", () => {
    assert.equal(sha256Hex("a"), sha256Hex("a"));
    assert.notEqual(sha256Hex("a"), sha256Hex("b"));
  });
});

describe("requireAuth — disabled by default (non-breaking)", () => {
  beforeEach(() => delete process.env.AUTH_ENFORCED);
  test("returns ok/disabled when AUTH_ENFORCED is unset", async () => {
    assert.equal(authEnforced(), false);
    const r = await requireAuth(new Request(ORIGIN + PATH, { method: "POST" }));
    assert.deepEqual(r, { ok: true, mode: "disabled" });
  });
});

describe("requireAuth — enforced", () => {
  beforeEach(() => {
    process.env.AUTH_ENFORCED = "true";
    process.env.API_KEYS = "key-one,key-two";
  });
  afterEach(() => {
    delete process.env.AUTH_ENFORCED;
    delete process.env.API_KEYS;
  });

  test("accepts a valid wallet signature bound to the request", async () => {
    const kp = Keypair.generate();
    const { req, rawBody } = signedRequest({ kp, rawBody: JSON.stringify({ amount: 1 }) });
    const r = await requireAuth(req, { rawBody });
    assert.equal(r.ok, true);
    assert.equal(r.ok && r.mode, "signature");
    assert.equal(r.ok && r.wallet, kp.publicKey.toBase58());
  });

  test("rejects when the body is tampered after signing (bodyHash mismatch)", async () => {
    const kp = Keypair.generate();
    const { req } = signedRequest({ kp, rawBody: JSON.stringify({ amount: 1 }) });
    const r = await requireAuth(req, { rawBody: JSON.stringify({ amount: 1000000 }) });
    assert.equal(r.ok, false);
  });

  test("rejects a signature from a different key", async () => {
    const signer = Keypair.generate();
    const { req, rawBody } = signedRequest({ kp: signer });
    // Swap the advertised wallet to someone else.
    const headers = new Headers(req.headers);
    headers.set("x-wallet", Keypair.generate().publicKey.toBase58());
    const forged = new Request(req.url, { method: "POST", headers });
    const r = await requireAuth(forged, { rawBody });
    assert.equal(r.ok, false);
  });

  test("rejects a stale timestamp (replay window)", async () => {
    const kp = Keypair.generate();
    const { req, rawBody } = signedRequest({ kp, ts: Date.now() - 10 * 60_000 });
    const r = await requireAuth(req, { rawBody });
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.reason, "stale request");
  });

  test("accepts a valid API key and rejects an invalid one", async () => {
    const good = new Request(ORIGIN + PATH, { method: "POST", headers: { "x-api-key": "key-two" } });
    assert.equal((await requireAuth(good)).ok, true);
    const bad = new Request(ORIGIN + PATH, { method: "POST", headers: { "x-api-key": "nope" } });
    assert.equal((await requireAuth(bad)).ok, false);
  });

  test("rejects a request with no auth headers at all", async () => {
    const r = await requireAuth(new Request(ORIGIN + PATH, { method: "POST" }));
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.status, 401);
  });
});
