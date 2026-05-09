/**
 * Shared job-spec builder + hasher.
 *
 * Both the browser (when invoking the on-chain `create_job` instruction)
 * and the server (when verifying the resulting tx mirrors the right
 * Job PDA) need to derive the EXACT SAME spec hash from the EXACT SAME
 * canonical JSON. Any drift — different key order, missing field,
 * different timestamp — produces a different hash, a different PDA,
 * and the on-chain lookup fails.
 *
 * This module is the single source of truth. Use `buildJobSpec` to
 * produce the canonical JSON object and `hashJobSpec` to compute the
 * 32-byte SHA-256 (returned as a hex string by default, or as a
 * Uint8Array via `hashJobSpecBytes`).
 */

export interface JobSpecInput {
  posterWallet: string;
  amount: number;
  minWords: number;
  language?: string;
  /** ISO 8601 deadline string. Required. */
  deadline: string;
  /**
   * ISO 8601 createdAt timestamp. The CALLER controls this so the
   * client and server agree on the hash. If you let the server pick
   * its own timestamp, the hashes will diverge.
   */
  createdAt: string;
  title?: string;
  description?: string;
  requirements?: string;
  sourceText?: string;
  repoUrl?: string;
  targetUrl?: string;
  stylePreference?: string;
}

/**
 * Build the canonical JSON object that's hashed for the spec hash.
 * Key order is FIXED — do not reorder. Optional fields are spread
 * at the end so they only appear when truthy.
 */
export function buildJobSpec(input: JobSpecInput): Record<string, unknown> {
  return {
    posterWallet: input.posterWallet,
    amount: input.amount,
    minWords: input.minWords,
    language: input.language || "English",
    deadline: input.deadline,
    createdAt: input.createdAt,
    title: input.title || "",
    description: input.description || "",
    requirements: input.requirements || "",
    ...(input.sourceText ? { sourceText: input.sourceText } : {}),
    ...(input.repoUrl ? { repoUrl: input.repoUrl } : {}),
    ...(input.targetUrl ? { targetUrl: input.targetUrl } : {}),
    ...(input.stylePreference ? { stylePreference: input.stylePreference } : {}),
  };
}

/**
 * SHA-256 hex digest. Browser-safe — uses SubtleCrypto when running
 * in a browser context, falls back to Node `crypto` on the server.
 */
export async function hashJobSpec(
  spec: Record<string, unknown>,
): Promise<string> {
  const json = JSON.stringify(spec);

  // Browser path
  if (
    typeof globalThis !== "undefined" &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).crypto?.subtle
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subtle = (globalThis as any).crypto.subtle as SubtleCrypto;
    const data = new TextEncoder().encode(json);
    const buf = await subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // Node path — keep this isolated so the browser bundle doesn't try to
  // resolve "crypto" eagerly.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = require("crypto") as typeof import("crypto");
  return nodeCrypto.createHash("sha256").update(json).digest("hex");
}

/** Return the 32-byte hash as a Uint8Array (for Anchor instruction args). */
export async function hashJobSpecBytes(
  spec: Record<string, unknown>,
): Promise<Uint8Array> {
  const hex = await hashJobSpec(spec);
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
