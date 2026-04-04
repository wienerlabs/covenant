import bs58 from "bs58";

const ED25519_MULTICODEC_PREFIX = new Uint8Array([0xed, 0x01]);

/**
 * Generate a W3C DID from a Solana public key (Base58)
 * Format: did:key:z6Mk...
 */
export function generateDID(publicKeyBase58: string): string {
  const pubKeyBytes = bs58.decode(publicKeyBase58);
  const multicodecKey = new Uint8Array(ED25519_MULTICODEC_PREFIX.length + pubKeyBytes.length);
  multicodecKey.set(ED25519_MULTICODEC_PREFIX, 0);
  multicodecKey.set(pubKeyBytes, ED25519_MULTICODEC_PREFIX.length);
  const encoded = bs58.encode(multicodecKey);
  return `did:key:z${encoded}`;
}

/**
 * Resolve a DID back to a Solana public key (Base58)
 */
export function resolveDID(did: string): string | null {
  if (!did.startsWith("did:key:z")) return null;
  try {
    const encoded = did.slice(8); // Remove "did:key:z"
    const decoded = bs58.decode(encoded);
    // Skip the 2-byte multicodec prefix
    const pubKeyBytes = decoded.slice(2);
    return bs58.encode(pubKeyBytes);
  } catch {
    return null;
  }
}

/**
 * Verify a DID matches a Solana wallet address
 */
export function verifyDID(did: string, walletAddress: string): boolean {
  const resolved = resolveDID(did);
  return resolved === walletAddress;
}
