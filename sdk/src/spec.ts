import { createHash } from "crypto";
import type { JobSpec } from "./types";

/**
 * Deterministically hash a JobSpec. The on-chain program stores this as
 * `spec_hash` and validates it again in `accept_job` to prevent replay.
 *
 * The canonicalization is simple JSON with sorted keys — good enough for
 * the protocol's purpose (commitment, not comparison). Callers must use
 * the same canonicalization on both sides of the wire.
 */
export function hashSpec(spec: JobSpec): {
  hex: string;
  bytes: Uint8Array;
} {
  const canonical = canonicalJson(spec);
  const digest = createHash("sha256").update(canonical, "utf8").digest();
  return { hex: digest.toString("hex"), bytes: new Uint8Array(digest) };
}

/**
 * Stable JSON encoder: sorted keys, no whitespace, consistent type handling.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
    .join(",")}}`;
}
