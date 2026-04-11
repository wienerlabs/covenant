import { PublicKey } from "@solana/web3.js";

/** Covenant program ID on Solana devnet / mainnet-beta. */
export const COVENANT_PROGRAM_ID = new PublicKey(
  "HAptQVTwT4AYRzPkvT9UFxGEZEjqVs6ALF295WXXPTNo",
);

/** Devnet USDC mint (faucet-backed test mint used by covenant demos). */
export const DEVNET_USDC_MINT = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);

/** Mainnet USDC mint (the real Circle USDC). */
export const MAINNET_USDC_MINT = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
);

/** Default challenge period in seconds (24h). Can be overridden per job. */
export const DEFAULT_CHALLENGE_PERIOD_SECONDS = 24 * 60 * 60;

/** Minimum challenge period enforced by the protocol (1 hour). */
export const MIN_CHALLENGE_PERIOD_SECONDS = 60 * 60;

/** Maximum challenge period enforced by the protocol (7 days). */
export const MAX_CHALLENGE_PERIOD_SECONDS = 7 * 24 * 60 * 60;

/** Default dispute bond in basis points (10%). */
export const DEFAULT_BOND_BPS = 1_000;

/** Absolute minimum dispute bond (1 USDC in atomic units). */
export const DEFAULT_MIN_BOND_ABSOLUTE = 1_000_000;

/** Maximum delivery URI byte length the on-chain program accepts. */
export const DELIVERY_URI_MAX_LEN = 128;

/** Number of arbitrator slots in the v1 multisig. */
export const ARBITRATOR_COUNT = 3;

/** PDA seeds used by the program. */
export const PDA_SEEDS = {
  config: Buffer.from("config"),
  job: Buffer.from("job"),
  reputation: Buffer.from("reputation"),
  bond: Buffer.from("bond"),
} as const;
