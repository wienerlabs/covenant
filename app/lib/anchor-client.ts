import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import idl from "./covenant-idl.json";

const PROGRAM_ID = new PublicKey(
  "HAptQVTwT4AYRzPkvT9UFxGEZEjqVs6ALF295WXXPTNo"
);
const DEVNET_RPC = "https://api.devnet.solana.com";
const DEVNET_USDC_MINT = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);

export { PROGRAM_ID, DEVNET_USDC_MINT };

/**
 * Minimal wallet interface for AnchorProvider (server-side only).
 */
class NodeWallet {
  constructor(readonly payer: Keypair) {}
  get publicKey() {
    return this.payer.publicKey;
  }
  async signTransaction<T>(tx: T): Promise<T> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tx as any).partialSign(this.payer);
    return tx;
  }
  async signAllTransactions<T>(txs: T[]): Promise<T[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    txs.forEach((tx) => (tx as any).partialSign(this.payer));
    return txs;
  }
}

export function getAnchorProgram(signerKeypair: Keypair) {
  const connection = new Connection(DEVNET_RPC, "confirmed");
  const wallet = new NodeWallet(signerKeypair);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  return new Program(idl as Idl, provider);
}

export function keypairFromEnv(envVar: string): Keypair {
  const raw = process.env[envVar];
  if (!raw) throw new Error(`${envVar} not set`);
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

/**
 * Derive the JobEscrow PDA for a given poster + specHash.
 * Seeds: ["job", poster.pubkey, spec_hash (32 bytes)]
 */
export function deriveJobEscrowPDA(
  poster: PublicKey,
  specHash: Uint8Array
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("job"), poster.toBuffer(), Buffer.from(specHash)],
    PROGRAM_ID
  );
}

/**
 * Derive the AgentReputation PDA for a wallet.
 * Seeds: ["reputation", wallet.pubkey]
 */
export function deriveReputationPDA(
  wallet: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("reputation"), wallet.toBuffer()],
    PROGRAM_ID
  );
}
