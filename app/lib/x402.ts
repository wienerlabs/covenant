import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  PublicKey,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

const DEVNET_RPC = "https://api.devnet.solana.com";

export interface X402Payment {
  from: string;
  to: string;
  amount: number;
  memo: string;
  txHash: string;
  timestamp: string;
}

// Send a real x402 micropayment on Solana devnet
export async function sendX402Payment(
  fromKeypairBytes: number[],
  toAddress: string,
  amountSol: number,
  memo: string
): Promise<X402Payment> {
  const connection = new Connection(DEVNET_RPC, "confirmed");
  const fromKeypair = Keypair.fromSecretKey(Uint8Array.from(fromKeypairBytes));
  const toPublicKey = new PublicKey(toAddress);

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: fromKeypair.publicKey,
      toPubkey: toPublicKey,
      lamports: Math.round(amountSol * LAMPORTS_PER_SOL),
    })
  );

  const sig = await sendAndConfirmTransaction(connection, tx, [fromKeypair]);

  return {
    from: fromKeypair.publicKey.toBase58(),
    to: toAddress,
    amount: amountSol,
    memo,
    txHash: sig,
    timestamp: new Date().toISOString(),
  };
}

// Get keypair bytes from env
export function getAgentKeypair(agent: "alpha" | "omega"): number[] {
  const raw =
    agent === "alpha"
      ? process.env.AGENT_ALPHA_KEYPAIR
      : process.env.AGENT_OMEGA_KEYPAIR;
  if (!raw) throw new Error(`${agent} keypair not set`);
  return JSON.parse(raw);
}
