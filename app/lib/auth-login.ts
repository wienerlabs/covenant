"use client";

/**
 * Client side of the wallet-session login (C-091 activation).
 *
 * `ensureSession` is idempotent and de-duplicated: it checks the current
 * session, and only when there is no valid session for the connected wallet
 * does it prompt a single `signMessage` and exchange it for a cookie via
 * `/api/auth/login`. After that, every same-origin fetch authenticates via the
 * httpOnly cookie automatically — no per-request signing.
 */
import { signMessageWithWallet } from "./wallet-sign";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyWallet = any;

let loggedInWallet: string | null = null;
let inFlight: Promise<boolean> | null = null;

/** Must match `loginMessage` in lib/session.ts byte-for-byte. */
function loginMessage(wallet: string, ts: number): string {
  return `covenant-login:v1\n${wallet}\n${ts}`;
}

/**
 * Ensure a valid session cookie exists for `account`. Returns true when the
 * caller is authenticated (or when session auth is disabled on this
 * deployment, in which case nothing is required). Never throws.
 */
export async function ensureSession(
  selectedWallet: AnyWallet,
  account: string,
): Promise<boolean> {
  if (!account) return false;
  if (loggedInWallet === account) return true;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const current = await fetch("/api/auth/session", {
        credentials: "same-origin",
      })
        .then((r) => r.json())
        .catch(() => null);

      // Session auth not enabled on this deployment — nothing to do.
      if (current && current.configured === false) {
        loggedInWallet = account;
        return true;
      }
      // Already authenticated as this wallet.
      if (current && current.wallet === account) {
        loggedInWallet = account;
        return true;
      }

      const ts = Date.now();
      const message = loginMessage(account, ts);
      const signature = await signMessageWithWallet(selectedWallet, account, message);

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ wallet: account, signature, ts, message }),
      });
      if (!res.ok) return false;
      loggedInWallet = account;
      return true;
    } catch {
      return false;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Clear local login state + the server cookie on disconnect. */
export async function endSession(): Promise<void> {
  loggedInWallet = null;
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    });
  } catch {
    /* best effort */
  }
}
