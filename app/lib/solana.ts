import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createFailoverConnection } from "@/lib/rpc-failover";

let _connection: Connection | null = null;
let _deployerKeypair: Keypair | null = null;

export function getConnection(): Connection {
  if (!_connection) {
    // Multi-RPC failover — rotates through HELIUS / TRITON /
    // QUICKNODE / public RPC chain on rate-limit / 5xx / network err.
    _connection = createFailoverConnection("confirmed");
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
