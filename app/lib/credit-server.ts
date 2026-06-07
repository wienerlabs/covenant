/**
 * @file credit-server.ts — server-side helpers for Covenant Credit.
 *
 * Reads and (bot-only) writes the on-chain ClaimListing state introduced
 * in PR #36. Used by the `/api/claims*` API routes and by cron tasks
 * that scan for claim-related events.
 *
 * Human users never go through here — they invoke list_claim /
 * buy_claim / cancel_claim via the browser (see `lib/anchor-browser.ts`
 * extensions). The server's role is strictly:
 *   1. Verify a user-signed claim tx invoked our program
 *   2. Read the on-chain account back
 *   3. Mirror to the DB
 *
 * Bot helpers (botListClaim, botBuyClaim) exist for arena/battle/
 * autonomous demos where the server holds the bot's own keypair.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { AnchorProvider, BN, Program, type Idl } from "@coral-xyz/anchor";
import idl from "./covenant-idl.json";
import {
  PROGRAM_ID,
  USDC_MINT,
  USDC_DECIMALS,
  DEVNET_ENDPOINT,
} from "./constants";

// ---- Connection + program ----

export function getConnection(): Connection {
  const rpc =
    process.env.HELIUS_RPC_URL ||
    process.env.NEXT_PUBLIC_RPC_URL ||
    DEVNET_ENDPOINT;
  return new Connection(rpc, "confirmed");
}

class NodeWallet {
  constructor(public readonly payer: Keypair) {}
  get publicKey() {
    return this.payer.publicKey;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async signTransaction<T>(tx: T): Promise<T> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tx as any).partialSign(this.payer);
    return tx;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async signAllTransactions<T>(txs: T[]): Promise<T[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    txs.forEach((tx) => (tx as any).partialSign(this.payer));
    return txs;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getBotProgram(botKeypair: Keypair): Program<any> {
  const connection = getConnection();
  const wallet = new NodeWallet(botKeypair);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  return new Program(idl as Idl, provider);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getReadOnlyProgram(): Program<any> {
  return getBotProgram(Keypair.generate());
}

export function keypairFromEnv(envVar: string): Keypair {
  const raw = process.env[envVar];
  if (!raw) throw new Error(`${envVar} not set`);
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

// ---- PDA helpers ----

export function deriveJobPda(
  poster: PublicKey,
  specHash: Uint8Array | Buffer,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("job"), poster.toBuffer(), Buffer.from(specHash)],
    PROGRAM_ID,
  );
}

export function deriveClaimPda(jobPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("claim"), jobPda.toBuffer()],
    PROGRAM_ID,
  );
}

// ---- ClaimListing decoder ----

export type ClaimStatus = "Listed" | "Bought" | "Cancelled" | "Settled" | "Unknown";

export interface OnChainClaimListing {
  pda: string;
  job: string;
  seller: string;
  buyer: string | null;
  price: number; // human units
  priceAtomic: bigint;
  faceValue: number;
  faceValueAtomic: bigint;
  listedAt: number;
  boughtAt: number;
  status: ClaimStatus;
}

/**
 * Map an Anchor enum object (e.g. `{ bought: {} }`) to a ClaimStatus.
 * Exported for unit tests (C-085).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseClaimStatus(status: any): ClaimStatus {
  if (!status || typeof status !== "object") return "Unknown";
  const k = Object.keys(status)[0];
  if (!k) return "Unknown";
  const capitalized = k.charAt(0).toUpperCase() + k.slice(1);
  if (
    capitalized === "Listed" ||
    capitalized === "Bought" ||
    capitalized === "Cancelled" ||
    capitalized === "Settled"
  ) {
    return capitalized;
  }
  return "Unknown";
}

/**
 * Fetch + decode a ClaimListing by its PDA. Returns null if the account
 * does not exist (never listed or cancelled+closed).
 */
export async function fetchClaimListing(
  claimPda: PublicKey,
): Promise<OnChainClaimListing | null> {
  const program = getReadOnlyProgram();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await (program.account as any).claimListing.fetchNullable(
    claimPda,
  );
  if (!raw) return null;

  const priceAtomic: bigint = BigInt(raw.price.toString());
  const faceValueAtomic: bigint = BigInt(raw.faceValue.toString());
  const buyerStr = new PublicKey(raw.buyer).toBase58();
  const isBuyerDefault = buyerStr === PublicKey.default.toBase58();

  return {
    pda: claimPda.toBase58(),
    job: new PublicKey(raw.job).toBase58(),
    seller: new PublicKey(raw.seller).toBase58(),
    buyer: isBuyerDefault ? null : buyerStr,
    price: Number(priceAtomic) / 10 ** USDC_DECIMALS,
    priceAtomic,
    faceValue: Number(faceValueAtomic) / 10 ** USDC_DECIMALS,
    faceValueAtomic,
    listedAt: Number(raw.listedAt.toString()),
    boughtAt: Number(raw.boughtAt.toString()),
    status: parseClaimStatus(raw.status),
  };
}

/** Convenience: derive + fetch in one call. */
export async function fetchClaimForJob(
  jobPda: PublicKey,
): Promise<OnChainClaimListing | null> {
  const [claimPda] = deriveClaimPda(jobPda);
  return fetchClaimListing(claimPda);
}

// ---- Tx verification ----

/**
 * Verify a transaction both landed successfully AND invoked the
 * Covenant program at least once. Blocks the "arbitrary confirmed
 * signature" replay pattern flagged in audit C-04.
 */
export async function verifyTxInvokedCovenant(sig: string): Promise<void> {
  const conn = getConnection();
  const tx = await conn.getTransaction(sig, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });
  if (!tx) throw new Error(`tx ${sig.slice(0, 8)}… not found on chain`);
  if (tx.meta?.err) {
    throw new Error(`tx reverted: ${JSON.stringify(tx.meta.err)}`);
  }
  const keys = tx.transaction.message.staticAccountKeys ?? [];
  const programIdStr = PROGRAM_ID.toBase58();
  const invoked = keys.some((k) => k.toBase58() === programIdStr);
  if (!invoked) {
    throw new Error(
      `tx ${sig.slice(0, 8)}… did not invoke Covenant program ${programIdStr.slice(0, 8)}…`,
    );
  }
}

// ---- Bot-signed instruction helpers (arena/battle/autonomous) ----

/**
 * Bot-signed `list_claim`. Used only when the bot has an on-chain
 * Delivered job of its own to factor (i.e. bot is the original taker).
 */
export async function botListClaim(params: {
  takerBotKeypair: Keypair;
  poster: PublicKey;
  specHash: Buffer;
  priceAtomic: BN;
}): Promise<{ sig: string; claimPda: PublicKey }> {
  const { takerBotKeypair, poster, specHash, priceAtomic } = params;
  const program = getBotProgram(takerBotKeypair);
  const [jobPda] = deriveJobPda(poster, specHash);
  const [claimPda] = deriveClaimPda(jobPda);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sig = (await (program.methods as any)
    .listClaim(priceAtomic)
    .accounts({
      seller: takerBotKeypair.publicKey,
      jobEscrow: jobPda,
      poster,
      claimListing: claimPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc()) as string;

  return { sig, claimPda };
}

/**
 * Bot-signed `buy_claim`. Used by an autonomous lender bot that
 * auto-matches claims meeting reputation + discount thresholds.
 */
export async function botBuyClaim(params: {
  buyerBotKeypair: Keypair;
  poster: PublicKey;
  specHash: Buffer;
}): Promise<string> {
  const { buyerBotKeypair, poster, specHash } = params;
  const program = getBotProgram(buyerBotKeypair);
  const [jobPda] = deriveJobPda(poster, specHash);
  const [claimPda] = deriveClaimPda(jobPda);

  // Fetch the listing to discover the seller ATA we need to pay.
  const listing = await fetchClaimListing(claimPda);
  if (!listing) throw new Error("claim listing not found");
  const sellerPubkey = new PublicKey(listing.seller);

  const buyerAta = await getAssociatedTokenAddress(
    USDC_MINT,
    buyerBotKeypair.publicKey,
  );
  const sellerAta = await getAssociatedTokenAddress(USDC_MINT, sellerPubkey);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await (program.methods as any)
    .buyClaim()
    .accounts({
      buyer: buyerBotKeypair.publicKey,
      jobEscrow: jobPda,
      poster,
      claimListing: claimPda,
      buyerTokenAccount: buyerAta,
      sellerTokenAccount: sellerAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc()) as string;
}

// ---- Claim-aware finalize crank ----

/**
 * Derive the expected `reputation` PDA for a taker.
 */
export function deriveReputationPda(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("reputation"), wallet.toBuffer()],
    PROGRAM_ID,
  );
}

export interface BeneficiaryDecision {
  /** The wallet whose USDC ATA receives the escrow on finalize. */
  beneficiary: PublicKey;
  /** True when proceeds were routed to a claim buyer instead of the taker. */
  routedToBuyer: boolean;
  /** The buyer wallet (base58) when routed, else null. */
  buyer: string | null;
}

/**
 * Decide who a `finalize_payment` pays: the original taker, or — when the job's
 * receivable was *sold* via Covenant Credit (claim status `Bought` with a
 * buyer) — the buyer who factored it. A claim that is merely Listed, Cancelled,
 * Settled, or absent routes to the taker.
 *
 * This is also the guard for the "dispute-loss-after-buy" case: a job that
 * loses a dispute ends up `Resolved` (refunded to the poster), never
 * `Finalized`, so it never reaches this routing — a buyer is never paid on a
 * lost claim and carries the credit risk. Pure + exported for tests (C-085).
 */
export function resolveClaimBeneficiary(
  listing: Pick<OnChainClaimListing, "status" | "buyer"> | null,
  taker: PublicKey,
): BeneficiaryDecision {
  if (listing && listing.status === "Bought" && listing.buyer) {
    return {
      beneficiary: new PublicKey(listing.buyer),
      routedToBuyer: true,
      buyer: listing.buyer,
    };
  }
  return { beneficiary: taker, routedToBuyer: false, buyer: null };
}

/**
 * Permissionless finalize crank that correctly routes payment when a
 * claim has been sold.
 *
 * Logic:
 *   1. Derive the ClaimListing PDA for this job
 *   2. Fetch it; if status=Bought, the beneficiary ATA is the buyer's
 *      USDC ATA. Otherwise it's the taker's ATA.
 *   3. Invoke on-chain finalize_payment with:
 *      - crank = our CRANK_KEYPAIR / DEPLOYER_KEYPAIR signer
 *      - taker_token_account = beneficiary ATA from step 2
 *      - claim_listing = the PDA (always passed; uninitialized if no
 *        listing, Anchor still validates the address)
 *
 * Returns the tx signature. Throws on any on-chain error.
 */
export async function finalizeWithClaim(params: {
  crankKeypair: Keypair;
  poster: PublicKey;
  taker: PublicKey;
  specHash: Buffer;
  escrowTokenAccount: PublicKey;
}): Promise<{ sig: string; routedToBuyer: boolean; buyer: string | null }> {
  const { crankKeypair, poster, taker, specHash, escrowTokenAccount } = params;

  const program = getBotProgram(crankKeypair);
  const [jobPda] = deriveJobPda(poster, specHash);
  const [claimPda] = deriveClaimPda(jobPda);
  const [reputationPda] = deriveReputationPda(taker);

  // Discover who the beneficiary should be.
  const listing = await fetchClaimListing(claimPda);
  const {
    beneficiary: beneficiaryWallet,
    routedToBuyer,
    buyer: buyerStr,
  } = resolveClaimBeneficiary(listing, taker);

  const beneficiaryAta = await getAssociatedTokenAddress(
    USDC_MINT,
    beneficiaryWallet,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sig = (await (program.methods as any)
    .finalizePayment()
    .accounts({
      crank: crankKeypair.publicKey,
      jobEscrow: jobPda,
      poster,
      escrowTokenAccount,
      takerTokenAccount: beneficiaryAta,
      taker,
      takerReputation: reputationPda,
      claimListing: claimPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc()) as string;

  return { sig, routedToBuyer, buyer: buyerStr };
}

/**
 * Derive the escrow ATA owner ≡ the JobEscrow PDA. Since the on-chain
 * escrow_token_account was created in `create_job` as a random keypair
 * owned by the JobEscrow PDA, a caller that lost the escrowAta can
 * reconstruct it by asking the SPL Token program for the single token
 * account matching `(owner=jobPda, mint=tokenMint)`.
 *
 * This is expensive (RPC call) but works as a recovery path when the
 * DB row is missing escrowAta (pre-schema-bump jobs).
 */
export async function findEscrowTokenAccount(params: {
  jobPda: PublicKey;
}): Promise<PublicKey | null> {
  const conn = getConnection();
  const { jobPda } = params;
  const accounts = await conn.getTokenAccountsByOwner(jobPda, {
    mint: USDC_MINT,
  });
  if (accounts.value.length === 0) return null;
  // There's exactly one in the happy path. If multiple exist (shouldn't
  // per create_job semantics), take the first non-empty one.
  const nonEmpty = accounts.value.find(
    (a) => BigInt(a.account.data.length) > 0n,
  );
  return nonEmpty?.pubkey ?? accounts.value[0].pubkey;
}
