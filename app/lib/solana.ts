import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { CLUSTER, getRpcUrl } from "@/lib/network";

/**
 * Resolve the RPC URL. Order of preference:
 *   1. HELIUS_RPC_URL          (full enhanced URL)
 *   2. HELIUS_API_KEY          (built-in URL with cluster prefix)
 *   3. NEXT_PUBLIC_RPC_URL_*   (cluster-specific override, via lib/network)
 *   4. cluster default         (api.{cluster}.solana.com)
 */
function resolveRpcUrl(): string {
  if (process.env.HELIUS_RPC_URL) return process.env.HELIUS_RPC_URL;
  if (process.env.HELIUS_API_KEY) {
    const heliusCluster =
      CLUSTER === "mainnet-beta" ? "mainnet" : CLUSTER;
    return `https://${heliusCluster}.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
  }
  return getRpcUrl();
}

let _connection: Connection | null = null;
let _deployerKeypair: Keypair | null = null;

export function getConnection(): Connection {
  if (!_connection) {
    _connection = new Connection(resolveRpcUrl(), "confirmed");
  }
  return _connection;
}

export function getDeployerKeypair(): Keypair {
  if (!_deployerKeypair) {
    const raw = process.env.DEPLOYER_KEYPAIR;
    if (!raw) throw new Error("DEPLOYER_KEYPAIR env var not set");
    const bytes = JSON.parse(raw) as number[];
    _deployerKeypair = Keypair.fromSecretKey(Uint8Array.from(bytes));
  }
  return _deployerKeypair;
}

// Send a real marker transaction on devnet, returns tx signature
export async function sendMarkerTransaction(memo: string): Promise<string> {
  const connection = getConnection();
  const deployer = getDeployerKeypair();

  // Log the memo for traceability
  console.log(`[solana] Sending marker tx: ${memo}`);

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: deployer.publicKey,
      toPubkey: deployer.publicKey, // self-transfer as marker
      lamports: 1000, // 0.000001 SOL
    })
  );

  const sig = await sendAndConfirmTransaction(connection, tx, [deployer]);
  console.log(`[solana] Marker tx confirmed: ${sig}`);
  return sig;
}
