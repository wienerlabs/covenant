/**
 * Network constants — devnet-only deployment.
 *
 * Covenant is currently demo-locked to Solana **Devnet**. Mainnet
 * support has been intentionally removed; the cluster constant always
 * resolves to "devnet" regardless of any env var, and there are no
 * mainnet-specific code paths.
 *
 * If/when we ship to mainnet later, switch this module back to the
 * cluster-aware variant — see git history (commit before this one).
 */

import { PublicKey } from "@solana/web3.js";

export type Cluster = "devnet";

/** Always devnet — kept as a constant so consumers can reason about it. */
export const CLUSTER: Cluster = "devnet";

/** Type-narrowing flags. Mainnet/localnet/testnet are explicitly off. */
export const IS_MAINNET = false;
export const IS_DEVNET = true;
export const IS_LOCALNET = false;

/* ------------------------------------------------------------------ */
/*  RPC endpoints — devnet failover chain                              */
/* ------------------------------------------------------------------ */

const DEFAULT_RPC_CHAIN: string[] = [
  "https://api.devnet.solana.com",
];

/**
 * Build the full RPC chain for devnet:
 *   1. Helius / Triton / QuickNode env URLs (if configured)
 *   2. NEXT_PUBLIC_RPC_URL_DEVNET / NEXT_PUBLIC_RPC_URL / SOLANA_RPC_URL
 *   3. Default public devnet (last resort)
 */
export function getRpcChain(): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  const push = (url: string | undefined) => {
    if (!url) return;
    const trimmed = url.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    chain.push(trimmed);
  };

  // 1. Provider URLs
  if (process.env.HELIUS_RPC_URL) push(process.env.HELIUS_RPC_URL);
  else if (process.env.HELIUS_API_KEY) {
    push(`https://devnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`);
  }
  push(process.env.TRITON_RPC_URL);
  push(process.env.QUICKNODE_RPC_URL);

  // 2. Generic overrides
  push(process.env.NEXT_PUBLIC_RPC_URL_DEVNET);
  push(process.env.NEXT_PUBLIC_RPC_URL);
  push(process.env.SOLANA_RPC_URL);

  // 3. Default public devnet
  for (const url of DEFAULT_RPC_CHAIN) push(url);

  return chain;
}

/** Primary RPC URL — first entry in the chain. */
export function getRpcUrl(): string {
  return getRpcChain()[0];
}

export const RPC_URL = getRpcUrl();
export const RPC_CHAIN = getRpcChain();

/* ------------------------------------------------------------------ */
/*  Program ID                                                         */
/* ------------------------------------------------------------------ */

const DEFAULT_PROGRAM_ID = "5hstj5grBUL1BeSaPLYpgkD6n3ALasmbseRvKRFfCVNT";

const PROGRAM_ID_STR =
  process.env.NEXT_PUBLIC_PROGRAM_ID_DEVNET ||
  process.env.NEXT_PUBLIC_PROGRAM_ID ||
  DEFAULT_PROGRAM_ID;

export const PROGRAM_ID = new PublicKey(PROGRAM_ID_STR);

/* ------------------------------------------------------------------ */
/*  USDC mint (devnet test USDC)                                       */
/* ------------------------------------------------------------------ */

const DEFAULT_USDC = "F7RYRqCy8uWYxjxrXVhU3iUCRwa9bKBUTkGKktpyYueQ";

const USDC_MINT_STR =
  process.env.NEXT_PUBLIC_USDC_MINT_DEVNET ||
  process.env.NEXT_PUBLIC_USDC_MINT ||
  DEFAULT_USDC;

export const USDC_MINT = new PublicKey(USDC_MINT_STR);

export const USDC_DECIMALS = 6;

/* ------------------------------------------------------------------ */
/*  Explorer URL builder                                               */
/* ------------------------------------------------------------------ */

/** Build a Solana Explorer URL for a tx signature on devnet. */
export function explorerTxUrl(sig: string): string {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}

/** Build a Solana Explorer URL for an account on devnet. */
export function explorerAccountUrl(account: string): string {
  return `https://explorer.solana.com/address/${account}?cluster=devnet`;
}

/* ------------------------------------------------------------------ */
/*  Misc                                                               */
/* ------------------------------------------------------------------ */

/** Faucet is always enabled on devnet. */
export const FAUCET_ENABLED = true;

/** Cluster label for UI badges. */
export function getClusterLabel(): string {
  return "Devnet";
}
