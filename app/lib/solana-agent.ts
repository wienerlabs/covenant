import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

const RPC_URL = process.env.HELIUS_RPC_URL || "https://api.devnet.solana.com";

/**
 * Fetch Solana context for an agent — balance, recent transactions, account info.
 * Returns formatted text to inject into agent context.
 */
export async function getSolanaContext(query: string): Promise<string> {
  const results: string[] = [];
  const connection = new Connection(RPC_URL);

  // Try to extract a Solana address from the query
  const addressMatch = query.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
  if (addressMatch) {
    const address = addressMatch[0];
    try {
      const pubkey = new PublicKey(address);

      // Get SOL balance
      const balance = await connection.getBalance(pubkey);
      results.push(`SOL Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

      // Get account info
      const accountInfo = await connection.getAccountInfo(pubkey);
      if (accountInfo) {
        results.push(`Account Owner: ${accountInfo.owner.toBase58()}`);
        results.push(`Data Size: ${accountInfo.data.length} bytes`);
        results.push(`Executable: ${accountInfo.executable}`);
      }

      // Get recent signatures
      const sigs = await connection.getSignaturesForAddress(pubkey, { limit: 5 });
      if (sigs.length > 0) {
        results.push(`\nRecent Transactions (last ${sigs.length}):`);
        for (const sig of sigs) {
          const time = sig.blockTime ? new Date(sig.blockTime * 1000).toISOString() : "unknown";
          results.push(`  TX: ${sig.signature.slice(0, 16)}... | ${sig.err ? "FAILED" : "SUCCESS"} | ${time}`);
        }
      }
    } catch {
      results.push(`Could not fetch data for address: ${address}`);
    }
  }

  // Get current slot/epoch info
  try {
    const slot = await connection.getSlot();
    const epoch = await connection.getEpochInfo();
    results.push(`\nNetwork: Devnet | Slot: ${slot} | Epoch: ${epoch.epoch}`);
  } catch { /* ignore */ }

  return results.length > 0
    ? `[Solana On-Chain Data]\n${results.join("\n")}`
    : "";
}
