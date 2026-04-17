/**
 * @file escrow.ts — DEPRECATED custodial escrow helpers
 *
 * The previous version of this module shipped four custodial helpers
 * (`lockFundsInEscrow`, `releaseFundsToTaker`, `refundToPoster`, plus
 * `mintTestUSDC` for the faucet). They were the implementation of the
 * "single shared deployer wallet pool" pattern flagged as audit C-01
 * and H-02 — a mismatch with the README's promise of trust-minimized
 * optimistic settlement on Solana.
 *
 * As of the on-chain settlement refactor:
 *
 *   - Job creation, accept, submit, finalize, raise_dispute,
 *     resolve_dispute, and cancel_job all run as real on-chain
 *     instructions against the Covenant Anchor program.
 *
 *   - For HUMAN users, the browser invokes those instructions via
 *     `lib/anchor-browser.ts` and the API routes simply verify the
 *     resulting tx + mirror the on-chain JobEscrow state into the DB.
 *
 *   - For HEADLESS BOT agents (arena / battle / autonomous demos),
 *     `lib/program-server.ts` exposes `botCreateJob`, `botAcceptJob`,
 *     `botSubmitWork`, `botFinalizePayment`. These are signed with
 *     the BOT'S OWN keypair — the bot acts on its own behalf with
 *     its own funds. The server never signs to move user USDC.
 *
 * The three custodial functions below are kept ONLY as throwing stubs
 * so that any forgotten import shows a clear failure message at runtime
 * pointing the operator at the on-chain replacement, instead of
 * silently sending real money through the deployer wallet.
 *
 * `mintTestUSDC` and `getTokenBalance` remain functional: minting test
 * USDC is the legitimate use of the test-mint authority key, and
 * reading balances doesn't require any signer.
 */

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";

const DEVNET_RPC = "https://api.devnet.solana.com";
const TEST_USDC_MINT = new PublicKey("F7RYRqCy8uWYxjxrXVhU3iUCRwa9bKBUTkGKktpyYueQ");
const USDC_DECIMALS = 6;

function getConnection() {
  return new Connection(DEVNET_RPC, "confirmed");
}

function keypairFromEnv(envVar: string): Keypair {
  const raw = process.env[envVar];
  if (!raw) throw new Error(`${envVar} not set`);
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

function toTokenAmount(amount: number): bigint {
  return BigInt(Math.round(amount * Math.pow(10, USDC_DECIMALS)));
}

async function ensureATA(connection: Connection, payer: Keypair, owner: PublicKey): Promise<PublicKey> {
  const ata = await getAssociatedTokenAddress(TEST_USDC_MINT, owner);
  try {
    await getAccount(connection, ata);
    return ata;
  } catch {
    const { Transaction } = await import("@solana/web3.js");
    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(payer.publicKey, ata, owner, TEST_USDC_MINT),
    );
    await connection.sendTransaction(tx, [payer]);
    await new Promise((r) => setTimeout(r, 1000));
    return ata;
  }
}

const REMOVED_MSG = (fn: string, replacement: string) =>
  `${fn} was removed in the on-chain settlement refactor (audit C-01/H-02). ` +
  `Use ${replacement} instead. See lib/program-server.ts and lib/anchor-browser.ts.`;

/** @deprecated Use the on-chain `create_job` instruction instead. */
export async function lockFundsInEscrow(): Promise<never> {
  throw new Error(
    REMOVED_MSG(
      "lockFundsInEscrow",
      "botCreateJob (server) or createJobOnChain (browser)",
    ),
  );
}

/** @deprecated Use the on-chain `finalize_payment` instruction instead. */
export async function releaseFundsToTaker(): Promise<never> {
  throw new Error(
    REMOVED_MSG(
      "releaseFundsToTaker",
      "botFinalizePayment (server crank) or finalizePaymentOnChain (browser)",
    ),
  );
}

/** @deprecated Use the on-chain `cancel_job` instruction instead. */
export async function refundToPoster(): Promise<never> {
  throw new Error(
    REMOVED_MSG("refundToPoster", "cancelJobOnChain (browser) — the program refunds atomically"),
  );
}

/**
 * Faucet helper. The server holds the test-USDC mint authority — this
 * is a legitimate authority key, not a custody key. Production builds
 * point USDC_MINT at the canonical USDC mint and disable this helper.
 */
export async function mintTestUSDC(
  toWalletAddress: string,
  amount: number,
): Promise<{ txHash: string; ata: string }> {
  const connection = getConnection();
  const deployer = keypairFromEnv("DEPLOYER_KEYPAIR");
  const toPubkey = new PublicKey(toWalletAddress);
  const { mintTo } = await import("@solana/spl-token");

  const ata = await ensureATA(connection, deployer, toPubkey);
  const tokenAmount = toTokenAmount(amount);

  const sig = await mintTo(
    connection,
    deployer,
    TEST_USDC_MINT,
    ata,
    deployer,
    tokenAmount,
  );

  return { txHash: sig, ata: ata.toBase58() };
}

/** Read-only USDC balance lookup. */
export async function getTokenBalance(walletAddress: string): Promise<number> {
  const connection = getConnection();
  const wallet = new PublicKey(walletAddress);
  try {
    const ata = await getAssociatedTokenAddress(TEST_USDC_MINT, wallet);
    const account = await getAccount(connection, ata);
    return Number(account.amount) / Math.pow(10, USDC_DECIMALS);
  } catch {
    return 0;
  }
}

export { TEST_USDC_MINT, USDC_DECIMALS };
