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

  // Build the transaction without sending — we handle signing manually
  // because Anchor's `.rpc()` signer matching can conflict with
  // wallet-standard adapters that reject unknown co-signers.
  const tx = await (program.methods as any)
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
    .transaction();

  // Set recent blockhash + fee payer
  const connection = program.provider.connection;
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = poster;

  // Sign with the escrow token account keypair first (co-signer)
  tx.partialSign(escrowTokenAccount);

  // Sign with the user's wallet (poster) via the provider
  const signedTx = await ((program.provider as any).wallet as any).signTransaction(tx);

  // Send the fully-signed transaction
  const sig = await connection.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: false,
  });
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );

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

  const tx = await (program.methods as any)
    .submitWork(Array.from(workHash), deliveryUri)
    .accounts({ taker, jobEscrow: jobPda, poster })
    .transaction();

  const connection = program.provider.connection;
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = taker;

  const signedTx = await ((program.provider as any).wallet as any).signTransaction(tx);
  const sig = await connection.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: false,
  });
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  return sig;
}

/**
 * Build and sign an `accept_job` instruction. Taker registers as the
 * worker for the job.
 */
export async function acceptJobOnChain(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: Program<any>;
  taker: PublicKey;
  poster: PublicKey;
  specHash: Uint8Array;
}): Promise<string> {
  const { program, taker, poster, specHash } = params;
  const [jobPda] = deriveJobPda(poster, specHash);

  const tx = await (program.methods as any)
    .acceptJob(Array.from(specHash))
    .accounts({ taker, jobEscrow: jobPda, poster })
    .transaction();

  const connection = program.provider.connection;
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = taker;

  const signedTx = await ((program.provider as any).wallet as any).signTransaction(tx);
  const sig = await connection.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: false,
  });
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  return sig;
}

/**
 * Build and sign a `raise_dispute` instruction. Poster bonds USDC
 * to challenge the delivery within the challenge window.
 */
export async function raiseDisputeOnChain(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: Program<any>;
  poster: PublicKey;
  specHash: Uint8Array;
  reasonHash: Uint8Array;
  bond: BN;
  posterTokenAccount: PublicKey;
  tokenMint: PublicKey;
}): Promise<{ sig: string; bondPda: PublicKey }> {
  const { program, poster, specHash, reasonHash, bond, posterTokenAccount, tokenMint } = params;

  const [jobPda] = deriveJobPda(poster, specHash);
  const [configPda] = deriveConfigPda();
  const [bondPda] = deriveBondPda(jobPda);

  const tx = await (program.methods as any)
    .raiseDispute(Array.from(reasonHash), bond)
    .accounts({
      poster,
      config: configPda,
      jobEscrow: jobPda,
      bondTokenAccount: bondPda,
      posterTokenAccount,
      tokenMint,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .transaction();

  const connection = program.provider.connection;
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = poster;

  const signedTx = await ((program.provider as any).wallet as any).signTransaction(tx);
  const sig = await connection.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: false,
  });
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  return { sig, bondPda };
}

/**
 * Build and sign a `resolve_dispute` instruction. Called by an
 * arbitrator wallet whose pubkey is in the protocol config arbitrators
 * array. Reaching threshold (default 2-of-3) settles funds on-chain.
 *
 * resolution: { favorTaker: {} } | { favorPoster: {} } | { split: { takerAmount: BN } }
 */
export async function resolveDisputeOnChain(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: Program<any>;
  arbitrator: PublicKey;
  poster: PublicKey;
  taker: PublicKey;
  specHash: Uint8Array;
  escrowTokenAccount: PublicKey;
  posterTokenAccount: PublicKey;
  takerTokenAccount: PublicKey;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolution: any;
}): Promise<string> {
  const {
    program,
    arbitrator,
    poster,
    taker,
    specHash,
    escrowTokenAccount,
    posterTokenAccount,
    takerTokenAccount,
    resolution,
  } = params;

  const [jobPda] = deriveJobPda(poster, specHash);
  const [configPda] = deriveConfigPda();
  const [bondPda] = deriveBondPda(jobPda);
  const [reputationPda] = deriveReputationPda(taker);

  const tx = await (program.methods as any)
    .resolveDispute(resolution)
    .accounts({
      arbitrator,
      config: configPda,
      jobEscrow: jobPda,
      poster,
      escrowTokenAccount,
      bondTokenAccount: bondPda,
      posterTokenAccount,
      takerTokenAccount,
      taker,
      takerReputation: reputationPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .transaction();

  const connection = program.provider.connection;
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = arbitrator;

  const signedTx = await ((program.provider as any).wallet as any).signTransaction(tx);
  const sig = await connection.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: false,
  });
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  return sig;
}

/**
 * Build and sign a `cancel_job` instruction. Two valid paths:
 *   A. Open job, signer == poster
 *   B. Accepted job past deadline, signer == poster OR taker
 */
export async function cancelJobOnChain(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: Program<any>;
  signer: PublicKey;
  poster: PublicKey;
  taker: PublicKey;
  specHash: Uint8Array;
  escrowTokenAccount: PublicKey;
  posterTokenAccount: PublicKey;
}): Promise<string> {
  const { program, signer, poster, taker, specHash, escrowTokenAccount, posterTokenAccount } = params;

  const [jobPda] = deriveJobPda(poster, specHash);
  const [reputationPda] = deriveReputationPda(taker);

  const tx = await (program.methods as any)
    .cancelJob()
    .accounts({
      signer,
      jobEscrow: jobPda,
      poster,
      escrowTokenAccount,
      posterTokenAccount,
      takerReputation: reputationPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .transaction();

  const connection = program.provider.connection;
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = signer;

  const signedTx = await ((program.provider as any).wallet as any).signTransaction(tx);
  const sig = await connection.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: false,
  });
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  return sig;
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

  const tx = await (program.methods as any)
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
    .transaction();

  const connection = program.provider.connection;
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = crank;

  const signedTx = await ((program.provider as any).wallet as any).signTransaction(tx);
  const sig = await connection.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: false,
  });
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  return sig;
}

// ---- Covenant Credit helpers ----

export function deriveClaimPda(jobPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("claim"), jobPda.toBuffer()],
    PROGRAM_ID,
  );
}

/**
 * Build + sign the on-chain `list_claim` instruction.
 *
 * Taker (seller) must have a Delivered job with no active dispute.
 * Price must be strictly less than the job's face value — there's no
 * rational buyer at par.
 */
export async function listClaimOnChain(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: Program<any>;
  seller: PublicKey;
  poster: PublicKey;
  specHash: Uint8Array;
  price: BN;
}): Promise<{ sig: string; claimPda: PublicKey }> {
  const { program, seller, poster, specHash, price } = params;
  const [jobPda] = deriveJobPda(poster, specHash);
  const [claimPda] = deriveClaimPda(jobPda);

  const tx = await (program.methods as any)
    .listClaim(price)
    .accounts({
      seller,
      jobEscrow: jobPda,
      poster,
      claimListing: claimPda,
      systemProgram: SystemProgram.programId,
    })
    .transaction();

  const connection = program.provider.connection;
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = seller;

  const signedTx = await ((program.provider as any).wallet as any).signTransaction(tx);
  const sig = await connection.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: false,
  });
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  return { sig, claimPda };
}

/**
 * Build + sign the on-chain `buy_claim` instruction.
 *
 * Buyer pays `claim_listing.price` USDC to the seller atomically and
 * inherits the right to collect `face_value` when finalize/resolve
 * fires. Rejects if buyer == seller.
 */
export async function buyClaimOnChain(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: Program<any>;
  buyer: PublicKey;
  poster: PublicKey;
  specHash: Uint8Array;
  buyerTokenAccount: PublicKey;
  sellerTokenAccount: PublicKey;
}): Promise<{ sig: string; claimPda: PublicKey }> {
  const { program, buyer, poster, specHash, buyerTokenAccount, sellerTokenAccount } = params;
  const [jobPda] = deriveJobPda(poster, specHash);
  const [claimPda] = deriveClaimPda(jobPda);

  const tx = await (program.methods as any)
    .buyClaim()
    .accounts({
      buyer,
      jobEscrow: jobPda,
      poster,
      claimListing: claimPda,
      buyerTokenAccount,
      sellerTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .transaction();

  const connection = program.provider.connection;
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = buyer;

  const signedTx = await ((program.provider as any).wallet as any).signTransaction(tx);
  const sig = await connection.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: false,
  });
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  return { sig, claimPda };
}

/**
 * Build + sign the on-chain `cancel_claim` instruction.
 *
 * Only the original seller may cancel, and only while the listing is
 * still in `Listed` state. Account is closed and rent refunded.
 */
export async function cancelClaimOnChain(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: Program<any>;
  seller: PublicKey;
  claimPda: PublicKey;
}): Promise<string> {
  const { program, seller, claimPda } = params;

  const tx = await (program.methods as any)
    .cancelClaim()
    .accounts({
      seller,
      claimListing: claimPda,
    })
    .transaction();

  const connection = program.provider.connection;
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = seller;

  const signedTx = await ((program.provider as any).wallet as any).signTransaction(tx);
  const sig = await connection.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: false,
  });
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  return sig;
}
