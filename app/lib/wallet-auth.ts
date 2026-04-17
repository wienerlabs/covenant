import bs58 from "bs58";
import nacl from "tweetnacl";

/**
 * Maximum clock skew between client and server for a signed request to be
 * considered fresh, in milliseconds. Requests with a `ts` older (or further
 * in the future) than this are rejected as stale/replayed.
 */
const MAX_TIMESTAMP_SKEW_MS = 5 * 60_000;

export type VerifyWalletSignatureArgs = {
  wallet: string;
  signature: string;
  message: string;
  expectedMessage: string;
  ts: number | string;
};

export type VerifyWalletSignatureResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Verify that `signature` is a valid Ed25519 signature of `message` produced
 * by the private key corresponding to the Solana `wallet` public key, and
 * that the request is fresh (`ts` within MAX_TIMESTAMP_SKEW_MS of now) and
 * the client-supplied `message` matches the server-computed `expectedMessage`
 * verbatim.
 *
 * Pure function — no Next.js / framework dependencies. Safe to import from
 * any server-side module.
 */
export function verifyWalletSignature(
  args: VerifyWalletSignatureArgs
): VerifyWalletSignatureResult {
  const { wallet, signature, message, expectedMessage, ts } = args;

  if (!wallet || typeof wallet !== "string") {
    return { ok: false, reason: "missing wallet" };
  }
  if (!signature || typeof signature !== "string") {
    return { ok: false, reason: "missing signature" };
  }
  if (!message || typeof message !== "string") {
    return { ok: false, reason: "missing message" };
  }
  if (ts === undefined || ts === null || ts === "") {
    return { ok: false, reason: "missing ts" };
  }

  // Normalize ts: accept unix ms (number or numeric string) or ISO string.
  let tsMs: number;
  if (typeof ts === "number") {
    tsMs = ts;
  } else {
    const asNum = Number(ts);
    if (Number.isFinite(asNum) && asNum > 0) {
      tsMs = asNum;
    } else {
      const parsed = Date.parse(ts);
      if (Number.isNaN(parsed)) {
        return { ok: false, reason: "invalid ts" };
      }
      tsMs = parsed;
    }
  }
  if (!Number.isFinite(tsMs)) {
    return { ok: false, reason: "invalid ts" };
  }

  if (Math.abs(Date.now() - tsMs) > MAX_TIMESTAMP_SKEW_MS) {
    return { ok: false, reason: "stale request" };
  }

  // Canonical message must match byte-for-byte.
  if (message !== expectedMessage) {
    return { ok: false, reason: "message mismatch" };
  }

  // Decode signature (base58) and public key (base58).
  let signatureBytes: Uint8Array;
  let pubkeyBytes: Uint8Array;
  try {
    signatureBytes = bs58.decode(signature);
  } catch {
    return { ok: false, reason: "invalid signature encoding" };
  }
  try {
    pubkeyBytes = bs58.decode(wallet);
  } catch {
    return { ok: false, reason: "invalid wallet encoding" };
  }

  if (signatureBytes.length !== 64) {
    return { ok: false, reason: "invalid signature length" };
  }
  if (pubkeyBytes.length !== 32) {
    return { ok: false, reason: "invalid wallet length" };
  }

  const messageBytes = new TextEncoder().encode(message);

  let ok: boolean;
  try {
    ok = nacl.sign.detached.verify(messageBytes, signatureBytes, pubkeyBytes);
  } catch {
    return { ok: false, reason: "verify failed" };
  }

  if (!ok) {
    return { ok: false, reason: "invalid signature" };
  }

  return { ok: true };
}
