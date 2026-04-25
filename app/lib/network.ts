/**
 * Cluster-aware network constants.
 *
 * Single source of truth for which Solana cluster the app is talking
 * to + which addresses live on it. All other modules should import
 * from here (or the re-exports in `lib/constants.ts`) instead of
 * hardcoding endpoints or mints.
 *
 * Switch clusters by setting `NEXT_PUBLIC_SOLANA_CLUSTER`:
 *   - "devnet"       (default)
 *   - "mainnet-beta"
 *   - "testnet"      (rarely used)
 *   - "localnet"     (local validator on http://127.0.0.1:8899)
 *
 * For mainnet you MUST also set:
 *   - NEXT_PUBLIC_PROGRAM_ID_MAINNET    (the deployed Covenant program)
 *   - NEXT_PUBLIC_RPC_URL_MAINNET       (Helius / Triton / QuickNode preferred)
 *
 * USDC mint is hardcoded for mainnet (Circle's canonical
 * EPjFWdd5...wyTDt1v) but overridable via NEXT_PUBLIC_USDC_MINT_MAINNET
 * for testing fork environments.
 */

import { PublicKey } from "@solana/web3.js";

export type Cluster = "devnet" | "mainnet-beta" | "testnet" | "localnet";

const RAW_CLUSTER = (
  process.env.NEXT_PUBLIC_SOLANA_CLUSTER ||
  process.env.SOLANA_CLUSTER ||
  "devnet"
).toLowerCase();

export const CLUSTER: Cluster = (
  ["devnet", "mainnet-beta", "testnet", "localnet"] as Cluster[]
).includes(RAW_CLUSTER as Cluster)
  ? (RAW_CLUSTER as Cluster)
  : "devnet";

export const IS_MAINNET = CLUSTER === "mainnet-beta";
export const IS_DEVNET = CLUSTER === "devnet";
export const IS_LOCALNET = CLUSTER === "localnet";

/* ------------------------------------------------------------------ */
/*  RPC endpoints — multi-provider failover chain                      */
/* ------------------------------------------------------------------ */

/**
 * Default fallback RPC chain per cluster. Public Solana RPC is the
 * absolute last resort because it's heavily rate-limited under
 * production load.
 */
const DEFAULT_RPC_CHAIN: Record<Cluster, string[]> = {
  devnet: [
    "https://api.devnet.solana.com",
  ],
  "mainnet-beta": [
    // Public RPCs that don't require an API key. Order matters —
    // first responsive one wins. Configured providers (Helius /
    // Triton / QuickNode) take precedence via env vars below.
    "https://api.mainnet-beta.solana.com",
    "https://solana-mainnet.g.allthatnode.com",
    "https://solana-rpc.publicnode.com",
  ],
  testnet: ["https://api.testnet.solana.com"],
  localnet: ["http://127.0.0.1:8899"],
};

/**
 * Build the full RPC chain for the active cluster:
 *   1. Provider env URLs (Helius / Triton / QuickNode) — highest priority
 *   2. Cluster-specific override (NEXT_PUBLIC_RPC_URL_*)
 *   3. Generic override (NEXT_PUBLIC_RPC_URL / SOLANA_RPC_URL)
 *   4. Default public chain (last resort)
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

  // 1. Provider URLs — Helius first because it's most common
  if (process.env.HELIUS_RPC_URL) push(process.env.HELIUS_RPC_URL);
  else if (process.env.HELIUS_API_KEY) {
    const heliusCluster = CLUSTER === "mainnet-beta" ? "mainnet" : CLUSTER;
    push(`https://${heliusCluster}.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`);
  }
  push(process.env.TRITON_RPC_URL);
  push(process.env.QUICKNODE_RPC_URL);

  // 2. Cluster-specific override (e.g. NEXT_PUBLIC_RPC_URL_MAINNET_BETA)
  const envKey = `NEXT_PUBLIC_RPC_URL_${CLUSTER.toUpperCase().replace("-", "_")}`;
  push(process.env[envKey]);

  // 3. Generic override
  push(process.env.NEXT_PUBLIC_RPC_URL);
  push(process.env.SOLANA_RPC_URL);

  // 4. Default chain (always present as last resort)
  for (const url of DEFAULT_RPC_CHAIN[CLUSTER]) push(url);

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

const DEFAULT_PROGRAM_ID: Record<Cluster, string> = {
  devnet: "5hstj5grBUL1BeSaPLYpgkD6n3ALasmbseRvKRFfCVNT",
  // Placeholder — must be set via NEXT_PUBLIC_PROGRAM_ID_MAINNET when
  // the program is actually deployed on mainnet. Falls back to the
  // devnet ID just so the type is non-null; runtime assertions in
  // anchor-browser will reject mainnet tx attempts against a missing
  // mainnet program ID.
  "mainnet-beta": "5hstj5grBUL1BeSaPLYpgkD6n3ALasmbseRvKRFfCVNT",
  testnet: "5hstj5grBUL1BeSaPLYpgkD6n3ALasmbseRvKRFfCVNT",
  localnet: "5hstj5grBUL1BeSaPLYpgkD6n3ALasmbseRvKRFfCVNT",
};

const PROGRAM_ID_STR =
  (CLUSTER === "mainnet-beta" && process.env.NEXT_PUBLIC_PROGRAM_ID_MAINNET) ||
  (CLUSTER === "devnet" && process.env.NEXT_PUBLIC_PROGRAM_ID_DEVNET) ||
  process.env.NEXT_PUBLIC_PROGRAM_ID ||
  DEFAULT_PROGRAM_ID[CLUSTER];

export const PROGRAM_ID = new PublicKey(PROGRAM_ID_STR);

/* ------------------------------------------------------------------ */
/*  USDC mint                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_USDC: Record<Cluster, string> = {
  devnet: "F7RYRqCy8uWYxjxrXVhU3iUCRwa9bKBUTkGKktpyYueQ",
  "mainnet-beta": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // Circle USDC
  testnet: "F7RYRqCy8uWYxjxrXVhU3iUCRwa9bKBUTkGKktpyYueQ",
  localnet: "F7RYRqCy8uWYxjxrXVhU3iUCRwa9bKBUTkGKktpyYueQ",
};

const USDC_MINT_STR =
  (CLUSTER === "mainnet-beta" && process.env.NEXT_PUBLIC_USDC_MINT_MAINNET) ||
  (CLUSTER === "devnet" && process.env.NEXT_PUBLIC_USDC_MINT_DEVNET) ||
  process.env.NEXT_PUBLIC_USDC_MINT ||
  DEFAULT_USDC[CLUSTER];

export const USDC_MINT = new PublicKey(USDC_MINT_STR);

export const USDC_DECIMALS = 6;

/* ------------------------------------------------------------------ */
/*  Explorer URL builder                                               */
/* ------------------------------------------------------------------ */

/** Build a Solana Explorer URL for a tx signature on the active cluster. */
export function explorerTxUrl(sig: string): string {
  if (IS_MAINNET) return `https://explorer.solana.com/tx/${sig}`;
  return `https://explorer.solana.com/tx/${sig}?cluster=${CLUSTER}`;
}

/** Build a Solana Explorer URL for an account on the active cluster. */
export function explorerAccountUrl(account: string): string {
  if (IS_MAINNET) return `https://explorer.solana.com/address/${account}`;
  return `https://explorer.solana.com/address/${account}?cluster=${CLUSTER}`;
}

/* ------------------------------------------------------------------ */
/*  Misc                                                               */
/* ------------------------------------------------------------------ */

/** Should the on-page faucet route be enabled? Devnet only. */
export const FAUCET_ENABLED = IS_DEVNET;

/** Cluster label for UI badges. */
export const CLUSTER_LABEL: Record<Cluster, string> = {
  devnet: "Devnet",
  "mainnet-beta": "Mainnet",
  testnet: "Testnet",
  localnet: "Local",
};

export function getClusterLabel(): string {
  return CLUSTER_LABEL[CLUSTER];
}
