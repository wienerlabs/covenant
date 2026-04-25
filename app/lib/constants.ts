/**
 * Public constants for the Covenant frontend + API. Cluster-specific
 * values (PROGRAM_ID, USDC_MINT, RPC_URL) are resolved through
 * `lib/network.ts` so swapping clusters is a single env-var change.
 *
 * Switch clusters via `NEXT_PUBLIC_SOLANA_CLUSTER`:
 *   "devnet" (default) | "mainnet-beta" | "testnet" | "localnet"
 *
 * For mainnet you also MUST set:
 *   NEXT_PUBLIC_PROGRAM_ID_MAINNET   = <deployed Covenant program ID>
 *   NEXT_PUBLIC_RPC_URL_MAINNET      = <Helius / Triton URL>
 *   (NEXT_PUBLIC_USDC_MINT_MAINNET defaults to Circle USDC, override only for forks)
 */

import { PublicKey } from "@solana/web3.js";

// Re-exports — keep the existing import surface stable for the rest of
// the codebase. Anything importing from "@/lib/constants" still works.
export {
  PROGRAM_ID,
  USDC_MINT,
  USDC_DECIMALS,
  RPC_URL,
  CLUSTER,
  IS_MAINNET,
  IS_DEVNET,
  IS_LOCALNET,
  FAUCET_ENABLED,
  getRpcUrl,
  explorerTxUrl,
  explorerAccountUrl,
  getClusterLabel,
} from "@/lib/network";

/** @deprecated Use RPC_URL — kept for any direct callers expecting devnet. */
export const DEVNET_ENDPOINT = "https://api.devnet.solana.com";

/**
 * @deprecated Shared escrow wallet — no longer in use after the
 * on-chain settlement refactor (audit C-01 / H-02). Funds now live
 * in per-job PDA escrows owned by the Covenant Anchor program.
 *
 * Kept exported only so any forgotten reference still compiles. New
 * code should never import this — derive the per-job PDA via
 * `deriveJobPda(poster, specHash)` from `lib/program-server.ts` (or
 * `lib/anchor-browser.ts` on the client) instead.
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

export const PROTOCOL_FEE_BPS = 150; // 1.5%
