/**
 * @file client-escrow.ts — DEPRECATED custodial escrow tx builder
 *
 * Builds an SPL transfer transaction from the user's wallet to the
 * shared deployer-controlled escrow wallet. This was the
 * implementation of the "single shared pool" pattern flagged as
 * audit C-01 / H-02.
 *
 * The on-chain settlement refactor replaces this entirely. Job
 * creation now goes through the real on-chain `create_job` Anchor
 * instruction (see lib/anchor-browser.ts → createJobOnChain), which
 * locks USDC into a per-job PDA escrow owned by the program — no
 * shared deployer wallet involved.
 *
 * `buildEscrowLockTransaction` is kept as a throwing stub so any
 * stale UI import fails loudly with a clear migration message
 * instead of silently rebuilding the custodial flow.
 *
 * `checkUSDCBalance` remains functional because it is read-only and
 * does not move funds.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import {
  DEVNET_ENDPOINT as DEVNET_RPC,
  USDC_MINT as TEST_USDC_MINT,
  USDC_DECIMALS,
} from "./constants";

/** @deprecated Use `createJobOnChain` from lib/anchor-browser.ts. */
export async function buildEscrowLockTransaction(): Promise<never> {
  throw new Error(
    "buildEscrowLockTransaction was removed in the on-chain settlement refactor " +
    "(audit C-01 / H-02). Use createJobOnChain from lib/anchor-browser.ts to invoke " +
    "the on-chain create_job instruction directly. See README → 'Creating a job'.",
  );
}

/** Read-only USDC balance lookup. */
export async function checkUSDCBalance(wallet: string): Promise<number> {
  const connection = new Connection(DEVNET_RPC, "confirmed");
  const pubkey = new PublicKey(wallet);
  try {
    const ata = await getAssociatedTokenAddress(TEST_USDC_MINT, pubkey);
    const account = await getAccount(connection, ata);
    return Number(account.amount) / Math.pow(10, USDC_DECIMALS);
  } catch {
    return 0;
  }
}
