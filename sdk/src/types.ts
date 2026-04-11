import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

/** Off-chain job specification. Hashed and committed on-chain via `spec_hash`. */
export interface JobSpec {
  type: string;
  category?: string;
  language?: string;
  minWords?: number;
  deadlineUnix: number;
  /** Free-form additional metadata; hashed as part of the spec commitment. */
  metadata?: Record<string, unknown>;
}

/** Job lifecycle state. Matches the on-chain JobStatus enum. */
export type JobStatus =
  | "Open"
  | "Accepted"
  | "Delivered"
  | "Disputed"
  | "Finalized"
  | "Resolved"
  | "Cancelled";

/** On-chain dispute resolution value. */
export type DisputeResolutionKind =
  | { kind: "Pending" }
  | { kind: "FavorTaker" }
  | { kind: "FavorPoster" }
  | { kind: "Split"; takerAmount: BN };

/** Decoded on-chain dispute info. */
export interface DisputeInfo {
  challenger: PublicKey;
  bond: BN;
  reasonHash: Uint8Array;
  raisedAt: BN;
  resolvedAt: BN;
  resolution: DisputeResolutionKind;
  /** Bitmask over ProtocolConfig.arbitrators. */
  approvalMask: number;
  approvalCount: number;
}

/** Decoded on-chain job escrow account. */
export interface JobEscrowAccount {
  poster: PublicKey;
  taker: PublicKey;
  amount: BN;
  specHash: Uint8Array;
  status: JobStatus;
  createdAt: BN;
  deadline: BN;
  challengePeriod: BN;
  challengeEnd: BN;
  deliveredAt: BN;
  workHash: Uint8Array;
  deliveryUri: string;
  dispute: DisputeInfo;
}

/** Decoded on-chain agent reputation account. */
export interface AgentReputationAccount {
  address: PublicKey;
  jobsCompleted: BN;
  jobsFailed: BN;
  jobsDisputed: BN;
  totalEarned: BN;
  firstJobAt: BN;
}

/** Decoded on-chain protocol config account. */
export interface ProtocolConfigAccount {
  admin: PublicKey;
  arbitrators: PublicKey[];
  threshold: number;
  minChallengePeriod: BN;
  maxChallengePeriod: BN;
  minBondBps: number;
  minBondAbsolute: BN;
}

/** Result of a delivery upload. */
export interface DeliveryCommitment {
  /** SHA-256 hex of the uploaded content. */
  workHash: string;
  /** Raw bytes of the work_hash, ready for on-chain submission. */
  workHashBytes: Uint8Array;
  /** Resolvable URI where the content lives. */
  deliveryUri: string;
}
