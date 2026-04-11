import { createHash } from "crypto";
import { DELIVERY_URI_MAX_LEN } from "./constants";
import type { DeliveryCommitment } from "./types";

/**
 * Compute the SHA-256 work hash of a string or binary payload.
 * This is the commitment that goes on-chain via `submit_work`.
 */
export function hashWork(content: string | Buffer | Uint8Array): {
  hex: string;
  bytes: Uint8Array;
} {
  const input =
    typeof content === "string"
      ? Buffer.from(content, "utf8")
      : Buffer.from(content);
  const digest = createHash("sha256").update(input).digest();
  return { hex: digest.toString("hex"), bytes: new Uint8Array(digest) };
}

/**
 * Validate a delivery URI fits within the on-chain byte limit.
 * Throws if the URI exceeds DELIVERY_URI_MAX_LEN (128) bytes.
 */
export function validateDeliveryUri(uri: string): void {
  const bytes = Buffer.byteLength(uri, "utf8");
  if (bytes > DELIVERY_URI_MAX_LEN) {
    throw new Error(
      `Delivery URI is ${bytes} bytes; max ${DELIVERY_URI_MAX_LEN}. ` +
        `Consider a shorter gateway (e.g. ipfs.io/ipfs/<cid> -> w3s.link/ipfs/<cid>).`,
    );
  }
}

/**
 * Adapter interface for uploading work content and getting back a
 * resolvable URI. Implementations plug in Vercel Blob, IPFS, Arweave, S3, etc.
 */
export interface DeliveryStorage {
  upload(content: string | Buffer | Uint8Array, options?: {
    filename?: string;
    contentType?: string;
  }): Promise<{ uri: string }>;
}

/**
 * High-level helper: hash + upload + return on-chain ready commitment.
 *
 * Usage:
 * ```ts
 * const storage = new VercelBlobStorage(process.env.BLOB_READ_WRITE_TOKEN);
 * const commit = await uploadDelivery(storage, workText, { filename: "job-42.md" });
 * await sdk.submitWork(taker, jobPda, commit.workHashBytes, commit.deliveryUri);
 * ```
 */
export async function uploadDelivery(
  storage: DeliveryStorage,
  content: string | Buffer | Uint8Array,
  options?: { filename?: string; contentType?: string },
): Promise<DeliveryCommitment> {
  const hash = hashWork(content);
  const { uri } = await storage.upload(content, options);
  validateDeliveryUri(uri);
  return {
    workHash: hash.hex,
    workHashBytes: hash.bytes,
    deliveryUri: uri,
  };
}

/**
 * Vercel Blob storage adapter. Requires BLOB_READ_WRITE_TOKEN from Vercel.
 *
 * Keeps the SDK dependency-light by calling the Vercel Blob REST endpoint
 * directly rather than pulling `@vercel/blob`.
 */
export class VercelBlobStorage implements DeliveryStorage {
  constructor(private readonly token: string) {
    if (!token) {
      throw new Error("VercelBlobStorage requires BLOB_READ_WRITE_TOKEN");
    }
  }

  async upload(
    content: string | Buffer | Uint8Array,
    options?: { filename?: string; contentType?: string },
  ): Promise<{ uri: string }> {
    const filename =
      options?.filename ?? `covenant/delivery-${Date.now()}.txt`;
    const body =
      typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
    const res = await fetch(
      `https://blob.vercel-storage.com/${encodeURIComponent(filename)}`,
      {
        method: "PUT",
        headers: {
          authorization: `Bearer ${this.token}`,
          "content-type": options?.contentType ?? "application/octet-stream",
          "x-api-version": "7",
        },
        body,
      },
    );
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Vercel Blob upload failed: ${res.status} ${detail}`);
    }
    const json = (await res.json()) as { url?: string };
    if (!json.url) {
      throw new Error("Vercel Blob upload returned no URL");
    }
    return { uri: json.url };
  }
}

/**
 * Data URI adapter. Encodes content inline as a base64 data: URI.
 * Only useful for very small payloads (<90 bytes after base64 encoding) since
 * the on-chain DELIVERY_URI_MAX_LEN is 128 bytes. Use for tests and local
 * development where spinning up Vercel Blob is overkill.
 */
export class InlineDataUriStorage implements DeliveryStorage {
  async upload(
    content: string | Buffer | Uint8Array,
  ): Promise<{ uri: string }> {
    const buf =
      typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
    const uri = `data:text/plain;base64,${buf.toString("base64")}`;
    validateDeliveryUri(uri);
    return { uri };
  }
}
