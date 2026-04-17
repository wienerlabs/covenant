/**
 * Server-side helpers for reading and (when bot-owned) writing the
 * on-chain Covenant program state.
 *
 * Architecture:
 *   - Human-user flows: the BROWSER signs and broadcasts via
 *     `anchor-browser.ts`. The server's only on-chain job is to
 *     fetch the resulting account state and mirror it to the DB.
 *   - Bot agent flows (Alpha / Omega / autonomous): the SERVER signs
 *     using a bot keypair held in env. The bot is the principal —
 *     it does NOT custody other users' funds.
 *
 * No function in this module ever moves user funds with the deployer
 * keypair. The legacy custodial helpers in `lib/escrow.ts` are
 * deprecated and only retained for the test-USDC faucet (where the
 * server legitimately is the mint authority).
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { AnchorProvider, BN, Program, type Idl } from "@coral-xyz/anchor";
import idl from "./covenant-idl.json";
import {
  PROGRAM_ID,
  USDC_MINT,
  USDC_DECIMALS,
  DEVNET_ENDPOINT,
} from "./constants";

// ---------- Connection ----------

export function getServerConnection(): Connection {
  const rpc =
    process.env.HELIUS_RPC_URL ||
    process.env.NEXT_PUBLIC_RPC_URL ||
    DEVNET_ENDPOINT;
  return new Connection(rpc, "confirmed");
}

// ---------- Keypair loading ----------

export function keypairFromEnv(envVar: string): Keypair {
  const raw = process.env[envVar];
  if (!raw) throw new Error(`${envVar} not set`);
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

// ---------- Program ----------

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

/**
 * Build an Anchor Program for a bot wallet. The returned Program will
 * sign on-chain instructions with this bot's keypair only. Pass a
 * read-only Keypair if you only need to fetch accounts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getBotProgram(botKeypair: Keypair): Program<any> {
  const connection = getServerConnection();
  const wallet = new NodeWallet(botKeypair);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  return new Program(idl as Idl, provider);
}

/**
 * Read-only program handle (no signer) for fetching on-chain accounts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getReadOnlyProgram(): Program<any> {
  // Anchor still wants a wallet object even for reads; supply a throwaway.
  return getBotProgram(Keypair.generate());
}

// ---------- PDA helpers ----------

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

// ---------- Status helpers ----------

/** Anchor's IDL serializer represents enum variants as objects with a single key. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function statusKey(status: any): string {
  if (!status || typeof status !== "object") return "Unknown";
  const k = Object.keys(status)[0] ?? "Unknown";
  return k.charAt(0).toUpperCase() + k.slice(1);
}

export type OnChainJobStatus =
  | "Open"
  | "Accepted"
  | "Delivered"
  | "Disputed"
  | "Finalized"
  | "Resolved"
  | "Cancelled"
  | "Unknown";

export interface OnChainJobEscrow {
  pda: string;
  poster: string;
  taker: string;
  tokenMint: string;
  amount: number; // human units
  amountAtomic: bigint;
  specHashHex: string;
  status: OnChainJobStatus;
  createdAt: number;
  deadline: number;
  challengePeriod: number;
  challengeEnd: number;
  deliveredAt: number;
  workHashHex: string;
  deliveryUri: string;
  // Dispute info (if active or resolved)
  dispute: {
    active: boolean;
    challenger: string | null;
    bond: number;
    bondAtomic: bigint;
    reasonHashHex: string;
    raisedAt: number;
    resolvedAt: number;
    approvalCount: number;
    approvalMask: number;
    resolution: string;
  };
}

/**
 * Fetch and decode a JobEscrow account by PDA. Returns null if the
 * account does not exist.
 */
export async function fetchJobEscrow(
  jobPda: PublicKey,
): Promise<OnChainJobEscrow | null> {
  const program = getReadOnlyProgram();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await (program.account as any).jobEscrow.fetchNullable(jobPda);
  if (!raw) return null;

  const amountAtomic: bigint = BigInt(raw.amount.toString());
  const amount = Number(amountAtomic) / 10 ** USDC_DECIMALS;
  const bondAtomic: bigint = BigInt(raw.dispute.bond.toString());
  const bond = Number(bondAtomic) / 10 ** USDC_DECIMALS;

  // Decode delivery URI (fixed-size 128-byte buffer truncated by len)
  const uriBytes: number[] = Array.from(raw.deliveryUri || []);
  const uriLen: number = Number(raw.deliveryUriLen ?? 0);
  const deliveryUri = uriLen > 0
    ? Buffer.from(uriBytes.slice(0, uriLen)).toString("utf8")
    : "";

  return {
    pda: jobPda.toBase58(),
    poster: new PublicKey(raw.poster).toBase58(),
    taker: new PublicKey(raw.taker).toBase58(),
    tokenMint: new PublicKey(raw.tokenMint).toBase58(),
    amount,
    amountAtomic,
    specHashHex: Buffer.from(raw.specHash).toString("hex"),
    status: statusKey(raw.status) as OnChainJobStatus,
    createdAt: Number(raw.createdAt.toString()),
    deadline: Number(raw.deadline.toString()),
    challengePeriod: Number(raw.challengePeriod.toString()),
    challengeEnd: Number(raw.challengeEnd.toString()),
    deliveredAt: Number(raw.deliveredAt.toString()),
    workHashHex: Buffer.from(raw.workHash).toString("hex"),
    deliveryUri,
    dispute: {
      active: Number(raw.dispute.raisedAt.toString()) !== 0
        && Number(raw.dispute.resolvedAt.toString()) === 0,
      challenger: new PublicKey(raw.dispute.challenger).toBase58() === PublicKey.default.toBase58()
        ? null
        : new PublicKey(raw.dispute.challenger).toBase58(),
      bond,
      bondAtomic,
      reasonHashHex: Buffer.from(raw.dispute.reasonHash).toString("hex"),
      raisedAt: Number(raw.dispute.raisedAt.toString()),
      resolvedAt: Number(raw.dispute.resolvedAt.toString()),
      approvalCount: Number(raw.dispute.approvalCount ?? 0),
      approvalMask: Number(raw.dispute.approvalMask ?? 0),
      resolution: statusKey(raw.dispute.resolution),
    },
  };
}

/**
 * Verify a transaction on chain landed successfully. Returns the
 * confirmed transaction or throws.
 */
export async function verifyTxLanded(
  sig: string,
): Promise<void> {
  const conn = getServerConnection();
  const tx = await conn.getTransaction(sig, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });
  if (!tx) throw new Error(`tx ${sig.slice(0, 8)}… not found on chain`);
  if (tx.meta?.err) {
    throw new Error(`tx reverted: ${JSON.stringify(tx.meta.err)}`);
  }
}

/**
 * Verify that a transaction invoked the Covenant program at least once.
 * Catches the "any random tx hash" replay attack class (audit C-04).
 */
export async function verifyTxInvokedCovenant(sig: string): Promise<void> {
  const conn = getServerConnection();
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

// ---------- Bot-side instruction builders ----------

/**
 * Bot-side `create_job`. Used by demo agents (arena/battle/autonomous)
 * that have no UI to prompt — the server signs with the bot's keypair.
 *
 * IMPORTANT: This is only legitimate when the bot is acting on its own
 * behalf with its own funds. Never call this with a user's keypair.
 */
export async function botCreateJob(params: {
  botKeypair: Keypair;
  amount: number; // human units USDC
  specHash: Buffer;
  deadline: number; // unix seconds
  challengePeriod: number; // seconds
}): Promise<{
  sig: string;
  jobPda: PublicKey;
  escrowTokenAccount: PublicKey;
}> {
  const { botKeypair, amount, specHash, deadline, challengePeriod } = params;
  const program = getBotProgram(botKeypair);
  const conn = program.provider.connection;

  const [jobPda] = deriveJobPda(botKeypair.publicKey, specHash);
  const [configPda] = deriveConfigPda();
  const escrowKp = Keypair.generate();
  const posterAta = await getAssociatedTokenAddress(USDC_MINT, botKeypair.publicKey);

  // Make sure the bot's own ATA exists (bot funds must already be there).
  try {
    await getAccount(conn, posterAta);
  } catch {
    // Create the bot's ATA in a separate tx if missing — funds still
    // need to be deposited externally.
    const tx = await conn.sendTransaction(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      new (await import("@solana/web3.js")).Transaction().add(
        createAssociatedTokenAccountInstruction(
          botKeypair.publicKey,
          posterAta,
          botKeypair.publicKey,
          USDC_MINT,
        ),
      ),
      [botKeypair],
    );
    await conn.confirmTransaction(tx, "confirmed");
  }

  const amountAtomic = new BN(Math.round(amount * 10 ** USDC_DECIMALS));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sig: string = await (program.methods as any)
    .createJob(
      amountAtomic,
      Array.from(specHash),
      new BN(deadline),
      new BN(challengePeriod),
    )
    .accounts({
      poster: botKeypair.publicKey,
      config: configPda,
      jobEscrow: jobPda,
      escrowTokenAccount: escrowKp.publicKey,
      posterTokenAccount: posterAta,
      tokenMint: USDC_MINT,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .signers([escrowKp])
    .rpc();

  return { sig, jobPda, escrowTokenAccount: escrowKp.publicKey };
}

/**
 * Bot-side `accept_job`. Used by demo taker bots.
 */
export async function botAcceptJob(params: {
  takerBotKeypair: Keypair;
  poster: PublicKey;
  specHash: Buffer;
}): Promise<string> {
  const { takerBotKeypair, poster, specHash } = params;
  const program = getBotProgram(takerBotKeypair);
  const [jobPda] = deriveJobPda(poster, specHash);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await (program.methods as any)
    .acceptJob(Array.from(specHash))
    .accounts({
      taker: takerBotKeypair.publicKey,
      jobEscrow: jobPda,
      poster,
    })
    .rpc()) as string;
}

/**
 * Bot-side `submit_work`.
 */
export async function botSubmitWork(params: {
  takerBotKeypair: Keypair;
  poster: PublicKey;
  specHash: Buffer;
  workHash: Buffer;
  deliveryUri: string;
}): Promise<string> {
  const { takerBotKeypair, poster, specHash, workHash, deliveryUri } = params;
  const program = getBotProgram(takerBotKeypair);
  const [jobPda] = deriveJobPda(poster, specHash);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await (program.methods as any)
    .submitWork(Array.from(workHash), deliveryUri)
    .accounts({
      taker: takerBotKeypair.publicKey,
      jobEscrow: jobPda,
      poster,
    })
    .rpc()) as string;
}

/**
 * Permissionless `finalize_payment` crank. Anyone with SOL for fees
 * can call this once challenge_end has elapsed. We use the configured
 * crank keypair (CRANK_KEYPAIR or DEPLOYER_KEYPAIR fallback).
 */
export async function botFinalizePayment(params: {
  crankKeypair: Keypair;
  poster: PublicKey;
  taker: PublicKey;
  specHash: Buffer;
  escrowTokenAccount: PublicKey;
}): Promise<string> {
  const { crankKeypair, poster, taker, specHash, escrowTokenAccount } = params;
  const program = getBotProgram(crankKeypair);
  const [jobPda] = deriveJobPda(poster, specHash);
  const [reputationPda] = deriveReputationPda(taker);
  const takerAta = await getAssociatedTokenAddress(USDC_MINT, taker);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await (program.methods as any)
    .finalizePayment()
    .accounts({
      crank: crankKeypair.publicKey,
      jobEscrow: jobPda,
      poster,
      escrowTokenAccount,
      takerTokenAccount: takerAta,
      taker,
      takerReputation: reputationPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc()) as string;
}
