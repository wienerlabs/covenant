import { Program, AnchorProvider } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionSignature,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";

import {
  COVENANT_PROGRAM_ID,
  DEFAULT_CHALLENGE_PERIOD_SECONDS,
  DEFAULT_BOND_BPS,
  DEFAULT_MIN_BOND_ABSOLUTE,
} from "./constants";
import {
  deriveConfigPda,
  deriveJobPda,
  deriveReputationPda,
  deriveBondPda,
  deriveClaimPda,
} from "./pda";
import { hashSpec } from "./spec";
import { validateDeliveryUri } from "./delivery";
import type {
  JobSpec,
  JobEscrowAccount,
  JobStatus,
  AgentReputationAccount,
  ProtocolConfigAccount,
  DisputeInfo,
  DisputeResolutionKind,
  ClaimListingAccount,
  ClaimStatus,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProgram = Program<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawAccount = Record<string, any>;

function parseStatus(raw: RawAccount): JobStatus {
  if ("open" in raw) return "Open";
  if ("accepted" in raw) return "Accepted";
  if ("delivered" in raw) return "Delivered";
  if ("disputed" in raw) return "Disputed";
  if ("finalized" in raw) return "Finalized";
  if ("resolved" in raw) return "Resolved";
  if ("cancelled" in raw) return "Cancelled";
  throw new Error(`Unknown job status: ${JSON.stringify(raw)}`);
}

function parseResolution(raw: RawAccount): DisputeResolutionKind {
  if ("pending" in raw) return { kind: "Pending" };
  if ("favorTaker" in raw) return { kind: "FavorTaker" };
  if ("favorPoster" in raw) return { kind: "FavorPoster" };
  if ("split" in raw) {
    return { kind: "Split", takerAmount: new BN(raw.split.takerAmount ?? 0) };
  }
  return { kind: "Pending" };
}

function encodeResolution(
  r: DisputeResolutionKind,
): Record<string, unknown> {
  switch (r.kind) {
    case "Pending":
      return { pending: {} };
    case "FavorTaker":
      return { favorTaker: {} };
    case "FavorPoster":
      return { favorPoster: {} };
    case "Split":
      return { split: { takerAmount: r.takerAmount } };
  }
}

function decodeDispute(raw: RawAccount): DisputeInfo {
  return {
    challenger: raw.challenger,
    bond: new BN(raw.bond),
    reasonHash: new Uint8Array(raw.reasonHash),
    raisedAt: new BN(raw.raisedAt),
    resolvedAt: new BN(raw.resolvedAt),
    resolution: parseResolution(raw.resolution as RawAccount),
    approvalMask: raw.approvalMask,
    approvalCount: raw.approvalCount,
  };
}

function decodeDeliveryUri(bytes: Uint8Array | number[], len: number): string {
  const buf = Uint8Array.from(bytes).slice(0, len);
  return Buffer.from(buf).toString("utf8");
}

function parseClaimStatus(raw: RawAccount): ClaimStatus {
  if ("listed" in raw) return "Listed";
  if ("bought" in raw) return "Bought";
  if ("cancelled" in raw) return "Cancelled";
  if ("settled" in raw) return "Settled";
  throw new Error(`Unknown claim status: ${JSON.stringify(raw)}`);
}

/**
 * High-level SDK for the Covenant optimistic settlement protocol.
 *
 * Wraps an Anchor program reference with ergonomic methods for every
 * instruction plus account decoding and a handful of read-helpers.
 */
export class CovenantClient {
  constructor(
    private readonly program: AnyProgram,
    public readonly connection: Connection,
  ) {}

  /** Convenience: build a CovenantClient from a Connection and IDL. */
  static fromProvider(
    provider: AnchorProvider,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    idl: any,
    programId: PublicKey = COVENANT_PROGRAM_ID,
  ): CovenantClient {
    const program = new Program(idl, programId, provider) as AnyProgram;
    return new CovenantClient(program, provider.connection);
  }

  get programId(): PublicKey {
    return this.program.programId;
  }

  // ---- PDA helpers ----

  configPda(): PublicKey {
    return deriveConfigPda(this.programId)[0];
  }

  jobPda(poster: PublicKey, specHash: Uint8Array): PublicKey {
    return deriveJobPda(poster, specHash, this.programId)[0];
  }

  reputationPda(wallet: PublicKey): PublicKey {
    return deriveReputationPda(wallet, this.programId)[0];
  }

  bondPda(job: PublicKey): PublicKey {
    return deriveBondPda(job, this.programId)[0];
  }

  // ---- Protocol config ----

  /**
   * Initialize the protocol config PDA.
   *
   * Call this once from the admin wallet. It sets the 2-of-3 multisig,
   * bond parameters, and challenge period bounds.
   */
  async initConfig(params: {
    admin: Keypair;
    arbitrators: [PublicKey, PublicKey, PublicKey];
    threshold?: number;
    minChallengePeriod?: number;
    maxChallengePeriod?: number;
    minBondBps?: number;
    minBondAbsolute?: BN | number;
  }): Promise<TransactionSignature> {
    const [configPda] = deriveConfigPda(this.programId);
    return (this.program.methods as any)
      .initConfig(
        params.arbitrators,
        params.threshold ?? 2,
        new BN(params.minChallengePeriod ?? 60 * 60),
        new BN(params.maxChallengePeriod ?? 7 * 24 * 60 * 60),
        params.minBondBps ?? DEFAULT_BOND_BPS,
        new BN(params.minBondAbsolute ?? DEFAULT_MIN_BOND_ABSOLUTE),
      )
      .accounts({
        admin: params.admin.publicKey,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([params.admin])
      .rpc();
  }

  /**
   * Rotate the arbitrator multisig. Admin only.
   */
  async updateArbitrators(params: {
    admin: Keypair;
    arbitrators: [PublicKey, PublicKey, PublicKey];
    threshold?: number;
  }): Promise<TransactionSignature> {
    const [configPda] = deriveConfigPda(this.programId);
    return (this.program.methods as any)
      .updateArbitrators(params.arbitrators, params.threshold ?? 2)
      .accounts({
        admin: params.admin.publicKey,
        config: configPda,
      })
      .signers([params.admin])
      .rpc();
  }

  // ---- Job lifecycle ----

  /**
   * Create a new escrow job. Locks `amount` tokens into a PDA-owned account.
   */
  async createJob(params: {
    poster: Keypair;
    spec: JobSpec;
    amount: BN | number;
    posterTokenAccount: PublicKey;
    tokenMint: PublicKey;
    challengePeriodSeconds?: number;
  }): Promise<{ txSig: TransactionSignature; jobPda: PublicKey; specHash: Uint8Array }> {
    const { bytes: specHash } = hashSpec(params.spec);
    const [jobPda] = deriveJobPda(
      params.poster.publicKey,
      specHash,
      this.programId,
    );
    const [configPda] = deriveConfigPda(this.programId);
    const escrowTokenAccount = Keypair.generate();
    const amount = new BN(params.amount);
    const deadline = new BN(params.spec.deadlineUnix);
    const challengePeriod = new BN(
      params.challengePeriodSeconds ?? DEFAULT_CHALLENGE_PERIOD_SECONDS,
    );

    const txSig = await (this.program.methods as any)
      .createJob(amount, Array.from(specHash), deadline, challengePeriod)
      .accounts({
        poster: params.poster.publicKey,
        config: configPda,
        jobEscrow: jobPda,
        escrowTokenAccount: escrowTokenAccount.publicKey,
        posterTokenAccount: params.posterTokenAccount,
        tokenMint: params.tokenMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([params.poster, escrowTokenAccount])
      .rpc();

    return { txSig, jobPda, specHash };
  }

  /**
   * Accept an open job as a taker. Verifies the spec hash locally.
   */
  async acceptJob(params: {
    taker: Keypair;
    jobPda: PublicKey;
    spec: JobSpec;
  }): Promise<{ txSig: TransactionSignature }> {
    const { bytes: specHash } = hashSpec(params.spec);
    const job = await this.fetchJob(params.jobPda);

    const txSig = await (this.program.methods as any)
      .acceptJob(Array.from(specHash))
      .accounts({
        taker: params.taker.publicKey,
        jobEscrow: params.jobPda,
        poster: job.poster,
      })
      .signers([params.taker])
      .rpc();

    return { txSig };
  }

  /**
   * Submit a delivery commitment for an accepted job. Starts the challenge
   * period. `workHash` should be the SHA-256 of the content at `deliveryUri`.
   */
  async submitWork(params: {
    taker: Keypair;
    jobPda: PublicKey;
    workHash: Uint8Array;
    deliveryUri: string;
  }): Promise<{ txSig: TransactionSignature }> {
    validateDeliveryUri(params.deliveryUri);
    const job = await this.fetchJob(params.jobPda);

    const txSig = await (this.program.methods as any)
      .submitWork(Array.from(params.workHash), params.deliveryUri)
      .accounts({
        taker: params.taker.publicKey,
        jobEscrow: params.jobPda,
        poster: job.poster,
      })
      .signers([params.taker])
      .rpc();

    return { txSig };
  }

  /**
   * Permissionless finalize — anyone can call this after the challenge
   * period expires (and no dispute is active). Releases escrow to the taker.
   */
  async finalizePayment(params: {
    crank: Keypair;
    jobPda: PublicKey;
    takerTokenAccount: PublicKey;
    escrowTokenAccount: PublicKey;
  }): Promise<{ txSig: TransactionSignature }> {
    const job = await this.fetchJob(params.jobPda);
    const reputationPda = this.reputationPda(job.taker);

    const txSig = await (this.program.methods as any)
      .finalizePayment()
      .accounts({
        crank: params.crank.publicKey,
        jobEscrow: params.jobPda,
        poster: job.poster,
        escrowTokenAccount: params.escrowTokenAccount,
        takerTokenAccount: params.takerTokenAccount,
        taker: job.taker,
        takerReputation: reputationPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([params.crank])
      .rpc();

    return { txSig };
  }

  /**
   * Raise a dispute against a delivered job. Poster only. Locks the bond.
   * `reasonHash` is the SHA-256 commitment of the off-chain reason text.
   */
  async raiseDispute(params: {
    poster: Keypair;
    jobPda: PublicKey;
    reasonHash: Uint8Array;
    bond: BN | number;
    posterTokenAccount: PublicKey;
    tokenMint: PublicKey;
  }): Promise<{ txSig: TransactionSignature; bondPda: PublicKey }> {
    const [configPda] = deriveConfigPda(this.programId);
    const [bondPda] = deriveBondPda(params.jobPda, this.programId);
    const bond = new BN(params.bond);

    const txSig = await (this.program.methods as any)
      .raiseDispute(Array.from(params.reasonHash), bond)
      .accounts({
        poster: params.poster.publicKey,
        config: configPda,
        jobEscrow: params.jobPda,
        bondTokenAccount: bondPda,
        posterTokenAccount: params.posterTokenAccount,
        tokenMint: params.tokenMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([params.poster])
      .rpc();

    return { txSig, bondPda };
  }

  /**
   * Resolve a dispute. Arbitrator only. Must be called by `threshold`
   * distinct whitelisted arbitrators for the same resolution.
   */
  async resolveDispute(params: {
    arbitrator: Keypair;
    jobPda: PublicKey;
    resolution: DisputeResolutionKind;
    posterTokenAccount: PublicKey;
    takerTokenAccount: PublicKey;
    escrowTokenAccount: PublicKey;
  }): Promise<{ txSig: TransactionSignature }> {
    const [configPda] = deriveConfigPda(this.programId);
    const [bondPda] = deriveBondPda(params.jobPda, this.programId);
    const job = await this.fetchJob(params.jobPda);
    const reputationPda = this.reputationPda(job.taker);

    const txSig = await (this.program.methods as any)
      .resolveDispute(encodeResolution(params.resolution))
      .accounts({
        arbitrator: params.arbitrator.publicKey,
        config: configPda,
        jobEscrow: params.jobPda,
        poster: job.poster,
        escrowTokenAccount: params.escrowTokenAccount,
        bondTokenAccount: bondPda,
        posterTokenAccount: params.posterTokenAccount,
        takerTokenAccount: params.takerTokenAccount,
        taker: job.taker,
        takerReputation: reputationPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([params.arbitrator])
      .rpc();

    return { txSig };
  }

  /** Cancel a job. Poster (Open) or anyone (Accepted past deadline). */
  async cancelJob(params: {
    signer: Keypair;
    jobPda: PublicKey;
    posterTokenAccount: PublicKey;
    escrowTokenAccount: PublicKey;
  }): Promise<{ txSig: TransactionSignature }> {
    const job = await this.fetchJob(params.jobPda);
    const reputationPda = this.reputationPda(
      job.taker.equals(PublicKey.default) ? params.signer.publicKey : job.taker,
    );

    const txSig = await (this.program.methods as any)
      .cancelJob()
      .accounts({
        signer: params.signer.publicKey,
        jobEscrow: params.jobPda,
        poster: job.poster,
        escrowTokenAccount: params.escrowTokenAccount,
        posterTokenAccount: params.posterTokenAccount,
        takerReputation: reputationPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([params.signer])
      .rpc();

    return { txSig };
  }

  // ---- Covenant Credit ----

  /**
   * Derive the ClaimListing PDA for a job.
   * seeds = [b"claim", job_escrow]
   */
  claimPda(jobPda: PublicKey): PublicKey {
    return deriveClaimPda(jobPda, this.program.programId)[0];
  }

  /**
   * List a pending payment claim at a discounted price. Only the taker
   * of a Delivered, non-disputed job may list. Exactly one listing per
   * job (PDA collision otherwise).
   */
  async listClaim(params: {
    seller: Keypair;
    jobPda: PublicKey;
    price: BN;
  }): Promise<{ txSig: TransactionSignature; claimPda: PublicKey }> {
    const job = await this.fetchJob(params.jobPda);
    const claimPda = this.claimPda(params.jobPda);

    const txSig = await (this.program.methods as any)
      .listClaim(params.price)
      .accounts({
        seller: params.seller.publicKey,
        jobEscrow: params.jobPda,
        poster: job.poster,
        claimListing: claimPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([params.seller])
      .rpc();

    return { txSig, claimPda };
  }

  /**
   * Buy a listed claim. The buyer pays `listing.price` USDC to the
   * seller atomically and becomes the beneficiary of subsequent
   * `finalize_payment` or `resolve_dispute` FavorTaker/Split proceeds.
   */
  async buyClaim(params: {
    buyer: Keypair;
    jobPda: PublicKey;
    buyerTokenAccount: PublicKey;
    sellerTokenAccount: PublicKey;
  }): Promise<{ txSig: TransactionSignature }> {
    const job = await this.fetchJob(params.jobPda);
    const claimPda = this.claimPda(params.jobPda);

    const txSig = await (this.program.methods as any)
      .buyClaim()
      .accounts({
        buyer: params.buyer.publicKey,
        jobEscrow: params.jobPda,
        poster: job.poster,
        claimListing: claimPda,
        buyerTokenAccount: params.buyerTokenAccount,
        sellerTokenAccount: params.sellerTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([params.buyer])
      .rpc();

    return { txSig };
  }

  /**
   * Cancel an unsold claim listing. Refunds rent to the seller.
   */
  async cancelClaim(params: {
    seller: Keypair;
    jobPda: PublicKey;
  }): Promise<{ txSig: TransactionSignature }> {
    const claimPda = this.claimPda(params.jobPda);
    const txSig = await (this.program.methods as any)
      .cancelClaim()
      .accounts({
        seller: params.seller.publicKey,
        claimListing: claimPda,
      })
      .signers([params.seller])
      .rpc();
    return { txSig };
  }

  /**
   * Fetch + decode a ClaimListing account. Returns null if the PDA is
   * uninitialized (no listing, or already cancelled + closed).
   */
  async fetchClaim(jobPda: PublicKey): Promise<ClaimListingAccount | null> {
    const claimPda = this.claimPda(jobPda);
    try {
      const raw = (await (this.program.account as any)["claimListing"].fetch(
        claimPda,
      )) as RawAccount;
      return {
        job: raw.job,
        seller: raw.seller,
        buyer: raw.buyer,
        price: new BN(raw.price),
        faceValue: new BN(raw.faceValue),
        listedAt: new BN(raw.listedAt),
        boughtAt: new BN(raw.boughtAt),
        status: parseClaimStatus(raw.status as RawAccount),
        bump: Number(raw.bump),
      };
    } catch {
      return null;
    }
  }

  // ---- Account fetchers ----

  async fetchJob(jobPda: PublicKey): Promise<JobEscrowAccount> {
    const raw = (await (this.program.account as any)["jobEscrow"].fetch(
      jobPda,
    )) as RawAccount;
    return {
      poster: raw.poster,
      taker: raw.taker,
      amount: new BN(raw.amount),
      specHash: new Uint8Array(raw.specHash),
      status: parseStatus(raw.status as RawAccount),
      createdAt: new BN(raw.createdAt),
      deadline: new BN(raw.deadline),
      challengePeriod: new BN(raw.challengePeriod),
      challengeEnd: new BN(raw.challengeEnd),
      deliveredAt: new BN(raw.deliveredAt),
      workHash: new Uint8Array(raw.workHash),
      deliveryUri: decodeDeliveryUri(raw.deliveryUri, raw.deliveryUriLen),
      dispute: decodeDispute(raw.dispute as RawAccount),
    };
  }

  async fetchReputation(
    wallet: PublicKey,
  ): Promise<AgentReputationAccount | null> {
    try {
      const raw = (await (this.program.account as any)["agentReputation"].fetch(
        this.reputationPda(wallet),
      )) as RawAccount;
      return {
        address: raw.address,
        jobsCompleted: new BN(raw.jobsCompleted),
        jobsFailed: new BN(raw.jobsFailed),
        jobsDisputed: new BN(raw.jobsDisputed),
        totalEarned: new BN(raw.totalEarned),
        firstJobAt: new BN(raw.firstJobAt),
      };
    } catch {
      return null;
    }
  }

  async fetchConfig(): Promise<ProtocolConfigAccount | null> {
    try {
      const raw = (await (this.program.account as any)["protocolConfig"].fetch(
        this.configPda(),
      )) as RawAccount;
      return {
        admin: raw.admin,
        arbitrators: raw.arbitrators as PublicKey[],
        threshold: raw.threshold,
        minChallengePeriod: new BN(raw.minChallengePeriod),
        maxChallengePeriod: new BN(raw.maxChallengePeriod),
        minBondBps: raw.minBondBps,
        minBondAbsolute: new BN(raw.minBondAbsolute),
      };
    } catch {
      return null;
    }
  }

  // ---- Derived predicates (used by UI) ----

  /** Can this job be finalized by any crank right now? */
  static canFinalize(job: JobEscrowAccount, nowUnix: number): boolean {
    return (
      job.status === "Delivered" &&
      job.dispute.raisedAt.isZero() &&
      nowUnix >= job.challengeEnd.toNumber()
    );
  }

  /** Is this job currently in a dispute window where the poster can challenge? */
  static canDispute(job: JobEscrowAccount, nowUnix: number): boolean {
    return (
      job.status === "Delivered" &&
      job.dispute.raisedAt.isZero() &&
      nowUnix < job.challengeEnd.toNumber()
    );
  }

  /** Seconds remaining in the challenge period; negative if already expired. */
  static challengeRemaining(job: JobEscrowAccount, nowUnix: number): number {
    if (job.status !== "Delivered") return 0;
    return job.challengeEnd.toNumber() - nowUnix;
  }
}
