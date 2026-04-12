"use client";

/**
 * Browser-side Anchor provider that bridges the @solana/connector
 * wallet to Anchor's AnchorProvider interface.
 *
 * This is the glue that lets us call `program.methods.createJob(...)`
 * from React components and have the user's connected wallet sign
 * the resulting transaction automatically.
 */

import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PROGRAM_ID, DEVNET_ENDPOINT, USDC_MINT } from "./constants";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import idlJson from "./covenant-idl.json";

// Re-export for convenience
export { BN, PublicKey, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY, TOKEN_PROGRAM_ID };

/**
 * Minimal wallet adapter that satisfies AnchorProvider.
 * Delegates signing to the wallet-standard `selectedWallet` from
 * @solana/connector or to the injected window.solana (Phantom fallback).
 */
class BrowserWallet {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(
    public readonly publicKey: PublicKey,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly selectedWallet: any,
  ) {}

  async signTransaction<T extends Transaction | VersionedTransaction>(
    tx: T,
  ): Promise<T> {
    // Path 1: wallet-standard
    const feat = this.selectedWallet?.features?.["solana:signTransaction"];
    if (feat?.signTransaction) {
      const serialized =
        tx instanceof Transaction
          ? tx.serialize({ requireAllSignatures: false })
          : tx.serialize();
      const accountObj =
        this.selectedWallet.accounts?.find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (a: any) => a.address === this.publicKey.toBase58(),
        ) ?? this.selectedWallet.accounts?.[0];
      const result = await feat.signTransaction({
        transaction: new Uint8Array(serialized),
        account: accountObj,
        chain: "solana:devnet",
      });
      const signedBytes = Array.isArray(result)
        ? result[0]?.signedTransaction
        : result?.signedTransaction;
      if (signedBytes) {
        if (tx instanceof Transaction) {
          return Transaction.from(Buffer.from(signedBytes)) as T;
        }
        return VersionedTransaction.deserialize(
          Buffer.from(signedBytes),
        ) as T;
      }
    }

    // Path 2: window.solana (Phantom)
    if (typeof window !== "undefined") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const injected = (window as any).solana;
      if (injected?.signTransaction) {
        return (await injected.signTransaction(tx)) as T;
      }
    }

    throw new Error("No wallet signing method available");
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(
    txs: T[],
  ): Promise<T[]> {
    return Promise.all(txs.map((tx) => this.signTransaction(tx)));
  }
}

/**
 * Build a browser-side AnchorProvider + Program from the user's
 * connected wallet. Returns null if no wallet is connected.
 */
export function getAnchorProgram(
  walletPubkey: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectedWallet: any,
  rpcUrl?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Program<any> | null {
  if (!walletPubkey || !selectedWallet) return null;

  const connection = new Connection(
    rpcUrl || DEVNET_ENDPOINT,
    "confirmed",
  );
  const pubkey = new PublicKey(walletPubkey);
  const wallet = new BrowserWallet(pubkey, selectedWallet);
  const provider = new AnchorProvider(connection, wallet as any, {
    commitment: "confirmed",
    skipPreflight: false,
  });

  return new Program(idlJson as any, provider) as any;
}

// ---- PDA derivation helpers ----

export function deriveConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    PROGRAM_ID,
  );
}

export function deriveJobPda(
  poster: PublicKey,
  specHash: Uint8Array | Buffer,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("job"), poster.toBuffer(), Buffer.from(specHash)],
    PROGRAM_ID,
  );
}

export function deriveReputationPda(
  wallet: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("reputation"), wallet.toBuffer()],
    PROGRAM_ID,
  );
}

export function deriveBondPda(
  jobPda: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bond"), jobPda.toBuffer()],
    PROGRAM_ID,
  );
}

// ---- Instruction builders ----

/**
 * Build and sign a real `create_job` instruction through the user's
 * wallet. Returns the confirmed transaction signature.
 *
 * This creates a per-job PDA escrow owned by the program, NOT a
 * shared deployer wallet.
 */
export async function createJobOnChain(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: Program<any>;
  poster: PublicKey;
  specHash: Uint8Array;
  amount: BN;
  deadline: BN;
  challengePeriod: BN;
  posterTokenAccount: PublicKey;
  tokenMint: PublicKey;
}): Promise<{
  sig: string;
  jobPda: PublicKey;
  escrowTokenAccount: PublicKey;
}> {
  const {
    program,
    poster,
    specHash,
    amount,
    deadline,
    challengePeriod,
    posterTokenAccount,
    tokenMint,
  } = params;

  const [jobPda] = deriveJobPda(poster, specHash);
  const [configPda] = deriveConfigPda();
  const escrowTokenAccount = Keypair.generate();

  const sig = await (program.methods as any)
    .createJob(amount, Array.from(specHash), deadline, challengePeriod)
    .accounts({
      poster,
      config: configPda,
      jobEscrow: jobPda,
      escrowTokenAccount: escrowTokenAccount.publicKey,
      posterTokenAccount,
      tokenMint,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .signers([escrowTokenAccount])
    .rpc();

  return { sig, jobPda, escrowTokenAccount: escrowTokenAccount.publicKey };
}

/**
 * Build and sign a real `submit_work` instruction.
 */
export async function submitWorkOnChain(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: Program<any>;
  taker: PublicKey;
  poster: PublicKey;
  specHash: Uint8Array;
  workHash: Uint8Array;
  deliveryUri: string;
}): Promise<string> {
  const { program, taker, poster, specHash, workHash, deliveryUri } = params;
  const [jobPda] = deriveJobPda(poster, specHash);

  return (program.methods as any)
    .submitWork(Array.from(workHash), deliveryUri)
    .accounts({
      taker,
      jobEscrow: jobPda,
      poster,
    })
    .rpc();
}

/**
 * Build and sign a `finalize_payment` instruction.
 * Permissionless — any wallet can call this.
 */
export async function finalizePaymentOnChain(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: Program<any>;
  crank: PublicKey;
  poster: PublicKey;
  taker: PublicKey;
  specHash: Uint8Array;
  escrowTokenAccount: PublicKey;
  takerTokenAccount: PublicKey;
}): Promise<string> {
  const { program, crank, poster, taker, specHash, escrowTokenAccount, takerTokenAccount } = params;
  const [jobPda] = deriveJobPda(poster, specHash);
  const [reputationPda] = deriveReputationPda(taker);

  return (program.methods as any)
    .finalizePayment()
    .accounts({
      crank,
      jobEscrow: jobPda,
      poster,
      escrowTokenAccount,
      takerTokenAccount,
      taker,
      takerReputation: reputationPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}
