import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

export interface JobSpec {
  type: "text_output";
  minWords: number;
  language: string;
  deadlineUnix: number;
}

export interface JobEscrowAccount {
  poster: PublicKey;
  taker: PublicKey;
  amount: BN;
  specHash: Uint8Array;
  status: "Open" | "Accepted" | "Completed" | "Cancelled";
  createdAt: BN;
  deadline: BN;
}

export interface AgentReputationAccount {
  address: PublicKey;
  jobsCompleted: number;
  jobsFailed: number;
  totalEarned: BN;
  firstJobAt: BN;
}
