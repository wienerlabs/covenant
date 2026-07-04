/**
 * Network constants — cluster-aware (devnet default, mainnet opt-in).
 *
 * The active cluster is chosen by `COVENANT_ENV` (server) /
 * `NEXT_PUBLIC_COVENANT_ENV` (client): `"mainnet"` selects Solana
 * mainnet-beta, anything else stays on **devnet** (the safe default). No
 * cluster-specific value is hardcoded for mainnet except the canonical USDC
 * mint; the program ID MUST be supplied via env on mainnet and there is NO
 * devnet fallback, so a misconfigured mainnet deploy fails loudly instead of
 * silently pointing at the devnet program.
 *
 * Mainnet activation is env-only — see docs/MAINNET.md for the full runbook.
 */

import { PublicKey } from "@solana/web3.js";

export type Cluster = "devnet" | "mainnet";

/** Resolve the active cluster from env. Defaults to devnet. */
function resolveCluster(): Cluster {
  const raw = (
    process.env.NEXT_PUBLIC_COVENANT_ENV ||
    process.env.COVENANT_ENV ||
    "devnet"
  )
    .trim()
    .toLowerCase();
  return raw === "mainnet" || raw === "mainnet-beta" ? "mainnet" : "devnet";
}

export const CLUSTER: Cluster = resolveCluster();

/** Type-narrowing flags. */
export const IS_MAINNET = CLUSTER === "mainnet";
export const IS_DEVNET = CLUSTER === "devnet";
export const IS_LOCALNET = false;

/* ------------------------------------------------------------------ */
/*  RPC endpoints — cluster-specific failover chain                    */
/* ------------------------------------------------------------------ */

const DEFAULT_RPC_CHAIN: Record<Cluster, string[]> = {
  devnet: ["https://api.devnet.solana.com"],
  // Public mainnet-beta is heavily rate-limited; operators SHOULD set a
  // Helius/Triton/QuickNode URL. This is only the last-resort fallback.
  mainnet: ["https://api.mainnet-beta.solana.com"],
};

/** Helius host for the active cluster. */
function heliusHost(): string {
  return IS_MAINNET ? "mainnet.helius-rpc.com" : "devnet.helius-rpc.com";
}

/**
 * Build the full RPC chain for the active cluster:
 *   1. Helius / Triton / QuickNode env URLs (if configured)
 *   2. Cluster-specific + generic NEXT_PUBLIC_RPC_URL / SOLANA_RPC_URL
 *   3. Default public endpoint (last resort)
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
    push(`https://${heliusHost()}/?api-key=${process.env.HELIUS_API_KEY}`);
  }
  push(process.env.TRITON_RPC_URL);
  push(process.env.QUICKNODE_RPC_URL);

  // 2. Generic overrides (cluster-specific first, then generic)
  push(
    IS_MAINNET
      ? process.env.NEXT_PUBLIC_RPC_URL_MAINNET
      : process.env.NEXT_PUBLIC_RPC_URL_DEVNET,
  );
  push(process.env.NEXT_PUBLIC_RPC_URL);
  push(process.env.SOLANA_RPC_URL);

  // 3. Default public endpoint
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

const DEVNET_PROGRAM_ID = "5hstj5grBUL1BeSaPLYpgkD6n3ALasmbseRvKRFfCVNT";

function resolveProgramId(): string {
  if (IS_MAINNET) {
    const id =
      process.env.NEXT_PUBLIC_PROGRAM_ID_MAINNET ||
      process.env.NEXT_PUBLIC_PROGRAM_ID;
    if (!id) {
      // Fail closed: never fall back to the devnet program on mainnet.
      throw new Error(
        "COVENANT_ENV=mainnet but NEXT_PUBLIC_PROGRAM_ID_MAINNET is not set. " +
          "Deploy the program to mainnet and set the resulting program ID. " +
          "See docs/MAINNET.md.",
      );
    }
    return id;
  }
  return (
    process.env.NEXT_PUBLIC_PROGRAM_ID_DEVNET ||
    process.env.NEXT_PUBLIC_PROGRAM_ID ||
    DEVNET_PROGRAM_ID
  );
}

export const PROGRAM_ID = new PublicKey(resolveProgramId());

/* ------------------------------------------------------------------ */
/*  USDC mint                                                          */
/* ------------------------------------------------------------------ */

/** Canonical circle.com USDC on Solana mainnet-beta. */
const MAINNET_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
/** Covenant devnet test USDC (mintable via the faucet). */
const DEVNET_USDC = "F7RYRqCy8uWYxjxrXVhU3iUCRwa9bKBUTkGKktpyYueQ";

function resolveUsdcMint(): string {
  if (IS_MAINNET) {
    return (
      process.env.NEXT_PUBLIC_USDC_MINT_MAINNET ||
      process.env.NEXT_PUBLIC_USDC_MINT ||
      MAINNET_USDC
    );
  }
  return (
    process.env.NEXT_PUBLIC_USDC_MINT_DEVNET ||
    process.env.NEXT_PUBLIC_USDC_MINT ||
    DEVNET_USDC
  );
}

export const USDC_MINT = new PublicKey(resolveUsdcMint());

export const USDC_DECIMALS = 6;

/* ------------------------------------------------------------------ */
/*  Explorer URL builder                                              */
/* ------------------------------------------------------------------ */

/** `?cluster=` suffix for explorer links (mainnet-beta is the default). */
function explorerClusterQuery(): string {
  return IS_MAINNET ? "" : "?cluster=devnet";
}

/** Build a Solana Explorer URL for a tx signature. */
export function explorerTxUrl(sig: string): string {
  return `https://explorer.solana.com/tx/${sig}${explorerClusterQuery()}`;
}

/** Build a Solana Explorer URL for an account. */
export function explorerAccountUrl(account: string): string {
  return `https://explorer.solana.com/address/${account}${explorerClusterQuery()}`;
}

/* ------------------------------------------------------------------ */
/*  Misc                                                               */
/* ------------------------------------------------------------------ */

/** The faucet mints test USDC — devnet only, never on mainnet. */
export const FAUCET_ENABLED = IS_DEVNET;

/** Cluster label for UI badges. */
export function getClusterLabel(): string {
  return IS_MAINNET ? "Mainnet" : "Devnet";
}
