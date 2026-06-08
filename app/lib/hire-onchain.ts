/**
 * C-019 — real on-chain agent hire.
 *
 * Hiring a built-in/hosted agent posts a **real** job + escrow on-chain (no
 * marker memo): a funded platform poster wallet creates the job + locks USDC,
 * then the agent's own bot keypair accepts and delivers it. The orchestration
 * here is pure — the three on-chain calls are injected (the real ones live in
 * `lib/program-server.ts`), so the create → accept → deliver sequence is
 * unit-testable without a live chain, and the route wires the real deps.
 *
 * Funding contract (devnet): the poster keypair must already hold the job's
 * USDC in its ATA (the program transfers it into escrow on create_job) plus SOL
 * for fees/rent; the agent keypair needs SOL for fees only.
 */

import type { Keypair, PublicKey } from "@solana/web3.js";

/** The on-chain primitives this orchestration drives (from program-server). */
export interface HireOnchainDeps {
  botCreateJob: (p: {
    botKeypair: Keypair;
    amount: number;
    specHash: Buffer;
    deadline: number;
    challengePeriod: number;
  }) => Promise<{ sig: string; jobPda: PublicKey; escrowTokenAccount: PublicKey }>;
  botAcceptJob: (p: {
    takerBotKeypair: Keypair;
    poster: PublicKey;
    specHash: Buffer;
  }) => Promise<string>;
  botSubmitWork: (p: {
    takerBotKeypair: Keypair;
    poster: PublicKey;
    specHash: Buffer;
    workHash: Buffer;
    deliveryUri: string;
  }) => Promise<string>;
}

export interface HireOnchainParams {
  posterKeypair: Keypair;
  agentKeypair: Keypair;
  /** Job amount in human-unit USDC (must be in the poster's ATA). */
  amount: number;
  /** sha256 of the job spec (32 bytes). */
  specHash: Buffer;
  /** Unix seconds. */
  deadlineUnix: number;
  /** Optimistic challenge window in seconds. */
  challengePeriodSec: number;
  /** sha256 of the delivered work (32 bytes). */
  workHash: Buffer;
  /** Where the deliverable lives (e.g. a blob URL). */
  deliveryUri: string;
  deps: HireOnchainDeps;
}

export interface HireOnchainResult {
  jobPda: string;
  escrowTokenAccount: string;
  createSig: string;
  acceptSig: string;
  submitSig: string;
}

/**
 * Run a full real on-chain hire: poster creates the job + escrow, then the
 * agent accepts and delivers. Throws if any step fails (the caller decides how
 * to surface a partially-advanced job — the reconciler heals DB state, C-021).
 */
export async function hireAgentOnchain(
  params: HireOnchainParams,
): Promise<HireOnchainResult> {
  const {
    posterKeypair,
    agentKeypair,
    amount,
    specHash,
    deadlineUnix,
    challengePeriodSec,
    workHash,
    deliveryUri,
    deps,
  } = params;

  if (agentKeypair.publicKey.equals(posterKeypair.publicKey)) {
    throw new Error("hireAgentOnchain: agent and poster must be different wallets");
  }

  // 1. Poster posts the real job + locks USDC escrow.
  const created = await deps.botCreateJob({
    botKeypair: posterKeypair,
    amount,
    specHash,
    deadline: deadlineUnix,
    challengePeriod: challengePeriodSec,
  });

  // 2. The agent (its own wallet) accepts on-chain.
  const acceptSig = await deps.botAcceptJob({
    takerBotKeypair: agentKeypair,
    poster: posterKeypair.publicKey,
    specHash,
  });

  // 3. The agent delivers on-chain.
  const submitSig = await deps.botSubmitWork({
    takerBotKeypair: agentKeypair,
    poster: posterKeypair.publicKey,
    specHash,
    workHash,
    deliveryUri,
  });

  return {
    jobPda: created.jobPda.toBase58(),
    escrowTokenAccount: created.escrowTokenAccount.toBase58(),
    createSig: created.sig,
    acceptSig,
    submitSig,
  };
}
