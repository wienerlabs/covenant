import { Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { createHash } from "crypto";
import BN from "bn.js";

import type { JobSpec, JobEscrowAccount, AgentReputationAccount } from "./types";
import { generateWordCountProof } from "./prover";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProgram = Program<any>;

/** Map Anchor's enum representation to a simple string. */
function parseStatus(
  raw: Record<string, unknown>,
): JobEscrowAccount["status"] {
  if ("open" in raw) return "Open";
  if ("accepted" in raw) return "Accepted";
  if ("completed" in raw) return "Completed";
  if ("cancelled" in raw) return "Cancelled";
  throw new Error(`Unknown job status: ${JSON.stringify(raw)}`);
}

/** SHA-256 hash of the JSON-encoded job spec. */
function hashSpec(spec: JobSpec): Uint8Array {
  const json = JSON.stringify(spec);
  const hash = createHash("sha256").update(json).digest();
  return new Uint8Array(hash);
}

/**
 * High-level SDK for interacting with the Covenant escrow program.
 */
export class CovenantSDK {
  constructor(
    private readonly program: AnyProgram,
    private readonly connection: Connection,
  ) {}

  /**
   * Create a new escrow job.
   *
   * @param poster             - Keypair of the job poster (pays for the job)
   * @param spec               - Job specification
   * @param amountUsdc         - Amount in USDC atomic units (e.g. 1_000_000 = 1 USDC)
   * @param posterTokenAccount - Poster's USDC token account
   * @param tokenMint          - USDC mint address
   */
  async createJob(
    poster: Keypair,
    spec: JobSpec,
    amountUsdc: number,
    posterTokenAccount: PublicKey,
    tokenMint: PublicKey,
  ): Promise<{ txSig: string; jobPda: PublicKey }> {
    const specHash = hashSpec(spec);
    const amount = new BN(amountUsdc);
    const deadline = new BN(spec.deadlineUnix);

    const [jobPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("job"),
        poster.publicKey.toBuffer(),
        Buffer.from(specHash),
      ],
      this.program.programId,
    );

    const escrowTokenAccount = Keypair.generate();

    const txSig = await (this.program.methods as any)
      .createJob(amount, Array.from(specHash), deadline)
      .accounts({
        poster: poster.publicKey,
        jobEscrow: jobPda,
        escrowTokenAccount: escrowTokenAccount.publicKey,
        posterTokenAccount,
        tokenMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([poster, escrowTokenAccount])
      .rpc();

    return { txSig, jobPda };
  }

  /**
   * Accept an open job as a taker.
   *
   * @param taker  - Keypair of the taker accepting the job
   * @param jobPda - Public key of the job escrow PDA
   * @param spec   - The job spec (used to compute the spec hash for verification)
   */
  async acceptJob(
    taker: Keypair,
    jobPda: PublicKey,
    spec: JobSpec,
  ): Promise<{ txSig: string }> {
    const specHash = hashSpec(spec);
    const job = await (this.program.account as any)["jobEscrow"].fetch(jobPda);

    const txSig = await (this.program.methods as any)
      .acceptJob(Array.from(specHash))
      .accounts({
        taker: taker.publicKey,
        jobEscrow: jobPda,
        poster: job.poster,
      })
      .signers([taker])
      .rpc();

    return { txSig };
  }

  /**
   * Submit completed work with a ZK proof.
   *
   * Generates a word-count proof via the SP1 prover and submits
   * it on-chain for verification and payment release.
   *
   * @param taker              - Keypair of the taker submitting work
   * @param jobPda             - Public key of the job escrow PDA
   * @param outputText         - The completed text (private witness)
   * @param minWords           - Minimum word count required by the spec
   * @param takerTokenAccount  - Taker's USDC token account to receive payment
   * @param escrowTokenAccount - The escrow's USDC token account
   */
  async submitCompletion(
    taker: Keypair,
    jobPda: PublicKey,
    outputText: string,
    minWords: number,
    takerTokenAccount: PublicKey,
    escrowTokenAccount: PublicKey,
  ): Promise<{ txSig: string }> {
    // Generate ZK proof
    const { proof } = await generateWordCountProof(outputText, minWords);

    // Compute text hash (must match what the circuit commits)
    const textHash = createHash("sha256").update(outputText).digest();

    const job = await (this.program.account as any)["jobEscrow"].fetch(jobPda);

    const txSig = await (this.program.methods as any)
      .submitCompletion(
        Buffer.from(proof),
        minWords,
        Array.from(new Uint8Array(textHash)),
      )
      .accounts({
        taker: taker.publicKey,
        jobEscrow: jobPda,
        poster: job.poster,
        escrowTokenAccount,
        takerTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([taker])
      .rpc();

    return { txSig };
  }

  /**
   * Cancel a job. Only callable by the poster when conditions are met.
   *
   * @param signer - Keypair of the poster cancelling the job
   * @param jobPda - Public key of the job escrow PDA
   */
  async cancelJob(
    signer: Keypair,
    jobPda: PublicKey,
  ): Promise<{ txSig: string }> {
    const txSig = await (this.program.methods as any)
      .cancelJob()
      .accounts({
        poster: signer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([signer])
      .rpc();

    return { txSig };
  }

  /**
   * Fetch a job escrow account.
   */
  async fetchJob(jobPda: PublicKey): Promise<JobEscrowAccount> {
    const raw = await (this.program.account as any)["jobEscrow"].fetch(jobPda);
    return {
      poster: raw.poster,
      taker: raw.taker,
      amount: raw.amount,
      specHash: new Uint8Array(raw.specHash),
      status: parseStatus(raw.status as Record<string, unknown>),
      createdAt: raw.createdAt,
      deadline: raw.deadline,
    };
  }

  /**
   * Fetch an agent's reputation account. Returns null if not found.
   */
  async fetchReputation(
    address: PublicKey,
  ): Promise<AgentReputationAccount | null> {
    try {
      const raw = await (this.program.account as any)["agentReputation"].fetch(address);
      return {
        address: raw.address,
        jobsCompleted: raw.jobsCompleted,
        jobsFailed: raw.jobsFailed,
        totalEarned: raw.totalEarned,
        firstJobAt: raw.firstJobAt,
      };
    } catch {
      return null;
    }
  }
}
