/**
 * Wallet session tokens (C-091 activation).
 *
 * A user proves wallet control ONCE by signing a login message
 * (`/api/auth/login`); the server then issues an HMAC-signed session token
 * stored in an httpOnly, SameSite=Lax cookie. Every subsequent same-origin
 * request carries the cookie automatically, so `requireAuth` can resolve the
 * caller's wallet without a per-request wallet popup — and `requireWalletMatch`
 * still binds that wallet to whatever the request mutates.
 *
 * The token is stateless: `v1.<walletB64url>.<expMs>.<hmac>`. No DB row, so
 * there is nothing to look up and nothing to leak. Rotating `SESSION_SECRET`
 * invalidates every outstanding session.
 */
import crypto from "node:crypto";

/** Cookie name carrying the session token. */
export const SESSION_COOKIE = "cvn_session";

/** Default session lifetime: 24h. */
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function secret(): string {
  // Accept either a dedicated secret or the generic app secret.
  return process.env.SESSION_SECRET || process.env.AUTH_SECRET || "";
}

/**
 * Whether session auth is usable. Requires a sufficiently long secret so a
 * weak/empty key can never silently produce forgeable tokens.
 */
export function sessionConfigured(): boolean {
  return secret().length >= 16;
}

function hmac(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** Mint a session token for `wallet`, valid until `now + ttlMs`. */
export function issueSession(
  wallet: string,
  now: number,
  ttlMs: number = SESSION_TTL_MS,
): string {
  const exp = now + ttlMs;
  const payload = `${Buffer.from(wallet, "utf8").toString("base64url")}.${exp}`;
  return `v1.${payload}.${hmac(payload)}`;
}

/**
 * Verify a session token and return its wallet when valid (correct HMAC and
 * not expired). Returns null on any tampering / expiry / misconfiguration.
 */
export function verifySession(
  token: string | undefined | null,
  now: number,
): { wallet: string } | null {
  if (!token || !sessionConfigured()) return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const payload = `${parts[1]}.${parts[2]}`;
  if (!timingSafeEqual(parts[3], hmac(payload))) return null;
  const exp = Number(parts[2]);
  if (!Number.isFinite(exp) || now > exp) return null;
  let wallet: string;
  try {
    wallet = Buffer.from(parts[1], "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!wallet) return null;
  return { wallet };
}

/** The exact message a client signs to log in. Versioned + reproduced client-side. */
export function loginMessage(wallet: string, ts: number | string): string {
  return `covenant-login:v1\n${wallet}\n${ts}`;
}

/** Read a cookie value from a raw request's Cookie header. */
export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    if (k === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}
