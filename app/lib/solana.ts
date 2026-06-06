import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createFailoverConnection } from "@/lib/rpc-failover";
import { assertSimulatedAllowed } from "@/lib/settlement";

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

/**
 * Send a 1000-lamport self-transfer as a "marker" tx on devnet.
 *
 * @deprecated This is a SIMULATED settlement path (audit C-01 / H-02): it
 * proves nothing about escrow — it just records a signature. Real lifecycle
 * routes must call the Anchor program instead (see lib/program-server.ts /
 * lib/anchor-browser.ts). Quarantined behind SETTLEMENT_MODE (C-003): it
 * throws in onchain mode so a still-faked route fails loudly.
 */
export async function sendMarkerTransaction(memo: string): Promise<string> {
  // C-003: a fake settlement path must not run when real settlement is required.
  assertSimulatedAllowed("sendMarkerTransaction");

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
