/**
 * C-091 — server-side auth for mutating endpoints.
 *
 * A mutating route can require that the caller proves control of a wallet (an
 * Ed25519 signature over a request-bound canonical message) OR presents a valid
 * API key. The check is **flag-gated**: until `AUTH_ENFORCED=true`, `requireAuth`
 * is a no-op (`mode: "disabled"`) so existing clients keep working while the
 * frontend is updated to sign. Flip the flag once the UI signs requests.
 *
 * Usage in a route:
 *
 *   const raw = await req.text();
 *   const auth = await requireAuth(req, { rawBody: raw });
 *   if (!auth.ok) return Response.json({ error: auth.reason }, { status: auth.status });
 *   const body = JSON.parse(raw);
 *
 * The canonical message binds method + path + a hash of the body + timestamp,
 * so a captured signature cannot be replayed against a different request, and
 * the freshness window in `verifyWalletSignature` blocks stale replays.
 */
import crypto from "node:crypto";
import { verifyWalletSignature } from "./wallet-auth";

/**
 * Whether mutating-endpoint auth is enforced.
 *
 * SECURITY: this is a phased-rollout flag. While it is unset every mutating
 * route is effectively unauthenticated. It MUST be flipped to "true" in
 * production once the frontend + SDK sign requests (see docs/SECURITY_AUDIT.md,
 * "auth enforcement"). When `NODE_ENV==="production"` and the flag is not
 * explicitly "true", we emit a loud one-time warning so the gap can't ship
 * silently.
 */
let warnedAuthOff = false;
export function authEnforced(): boolean {
  const on = process.env.AUTH_ENFORCED === "true";
  if (!on && process.env.NODE_ENV === "production" && !warnedAuthOff) {
    warnedAuthOff = true;
    console.error(
      "[security] AUTH_ENFORCED is not 'true' in production: mutating endpoints " +
        "accept unauthenticated requests. Enable wallet signing then set AUTH_ENFORCED=true.",
    );
  }
  return on;
}

/**
 * Bind an authenticated request to the wallet it claims to act on.
 *
 * `requireAuth` proves the caller controls the wallet in `x-wallet`, but it
 * does NOT check that this equals the wallet the request mutates (the `wallet`
 * field in the body / path). Without this binding a caller can sign as their
 * own wallet and act on someone else's — a systemic IDOR. Every mutating route
 * that takes a wallet from the body/path must call this with the prior
 * `requireAuth` result and the wallet it is about to act on.
 *
 *   const auth = await requireAuth(req, { rawBody: raw });
 *   if (!auth.ok) return Response.json({ error: auth.reason }, { status: auth.status });
 *   const guard = requireWalletMatch(auth, body.wallet);
 *   if (!guard.ok) return Response.json({ error: guard.reason }, { status: guard.status });
 *
 * Semantics:
 *   - mode "disabled" (flag off): no-op pass, so the binding is correct the
 *     instant AUTH_ENFORCED is flipped on without breaking the pre-signing UI.
 *   - mode "api_key": trusted automation, allowed to act on any wallet.
 *   - mode "signature": REQUIRE proven wallet === acting wallet.
 */
export function requireWalletMatch(
  auth: AuthResult,
  actingWallet: string | null | undefined,
): { ok: true } | { ok: false; status: number; reason: string } {
  if (!auth.ok) return { ok: false, status: auth.status, reason: auth.reason };
  if (auth.mode === "disabled" || auth.mode === "api_key") return { ok: true };
  // signature mode
  if (!actingWallet) {
    return { ok: false, status: 400, reason: "missing acting wallet" };
  }
  if (!auth.wallet || !timingSafeEqual(auth.wallet, actingWallet)) {
    return {
      ok: false,
      status: 403,
      reason: "signer does not control the target wallet",
    };
  }
  return { ok: true };
}

/** SHA-256 hex of a (possibly empty) request body. */
export function sha256Hex(body: string): string {
  return crypto.createHash("sha256").update(body, "utf8").digest("hex");
}

/**
 * The exact string a client must sign to authenticate a mutating request.
 * Versioned so the scheme can evolve. Pure + exported for tests and for the
 * SDK/UI to reproduce.
 */
export function canonicalAuthMessage(args: {
  method: string;
  path: string;
  ts: number | string;
  bodyHash: string;
}): string {
  return [
    "covenant-auth:v1",
    args.method.toUpperCase(),
    args.path,
    args.bodyHash,
    String(args.ts),
  ].join("\n");
}

export type AuthResult =
  | { ok: true; mode: "disabled" | "signature" | "api_key"; wallet?: string }
  | { ok: false; status: number; reason: string };

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** Parse the comma-separated `API_KEYS` allowlist. */
function allowedApiKeys(): string[] {
  return (process.env.API_KEYS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Verify a mutating request is authenticated by a wallet signature OR an API
 * key. Returns `{ ok: true, mode: "disabled" }` when `AUTH_ENFORCED` is unset
 * so callers stay backwards-compatible until the flag is flipped.
 *
 * Pass the already-read raw body (routes can only read it once).
 */
export async function requireAuth(
  req: Request,
  opts?: { rawBody?: string },
): Promise<AuthResult> {
  if (!authEnforced()) return { ok: true, mode: "disabled" };

  // 1. API-key path (server-to-server / trusted automation).
  const apiKey = req.headers.get("x-api-key");
  if (apiKey) {
    const ok = allowedApiKeys().some((k) => timingSafeEqual(k, apiKey));
    return ok
      ? { ok: true, mode: "api_key" }
      : { ok: false, status: 401, reason: "invalid api key" };
  }

  // 2. Wallet-signature path.
  const wallet = req.headers.get("x-wallet");
  const signature = req.headers.get("x-signature");
  const ts = req.headers.get("x-timestamp");
  if (!wallet || !signature || !ts) {
    return {
      ok: false,
      status: 401,
      reason: "missing auth: x-api-key, or x-wallet + x-signature + x-timestamp",
    };
  }

  const path = new URL(req.url).pathname;
  const bodyHash = sha256Hex(opts?.rawBody ?? "");
  const expected = canonicalAuthMessage({ method: req.method, path, ts, bodyHash });

  const res = verifyWalletSignature({
    wallet,
    signature,
    message: expected,
    expectedMessage: expected,
    ts,
  });
  return res.ok
    ? { ok: true, mode: "signature", wallet }
    : { ok: false, status: 401, reason: res.reason };
}
