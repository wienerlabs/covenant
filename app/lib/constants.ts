import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "HAptQVTwT4AYRzPkvT9UFxGEZEjqVs6ALF295WXXPTNo"
);

export const DEVNET_ENDPOINT = "https://api.devnet.solana.com";

export const USDC_DECIMALS = 6;

/**
 * Test USDC mint used across every Covenant flow on devnet. The /faucet
 * page mints this exact token, so every balance check, transfer and
 * escrow lock references the same pubkey. Do not change without also
 * updating the faucet and the agent wallets' ATAs.
 */
export const USDC_MINT = new PublicKey(
  "F7RYRqCy8uWYxjxrXVhU3iUCRwa9bKBUTkGKktpyYueQ"
);

/**
 * Escrow wallet that holds locked USDC during a job's lifecycle.
 *
 * For v1 this is the deployer wallet itself — practical, matches the
 * existing server-side release logic in lib/escrow.ts. A follow-up
 * moves escrow into a per-job PDA owned by the Anchor program.
 */
export const ESCROW_WALLET = new PublicKey(
  "Gy5cU3bNH1DKsff6rp91H1BmtEfwspziR52WfmMVfbPZ"
);

/**
 * Memo program address — used by SubmitWorkModal to attach a signed
 * delivery-commitment memo to the taker's transaction without moving
 * any tokens.
 */
export const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

export const USDC_LOGO_URL =
  "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png";

export const SOL_LOGO_URL =
  "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png";
