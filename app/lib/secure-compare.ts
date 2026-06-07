import crypto from "node:crypto";

/**
 * Constant-time string comparison for secrets / bearer tokens.
 *
 * Returns false on a length mismatch (length is not itself secret here)
 * and otherwise compares in time independent of how many bytes match, so
 * an attacker can't recover the secret byte-by-byte from response timing.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
