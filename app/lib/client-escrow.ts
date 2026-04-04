import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createTransferInstruction,
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";

const DEVNET_RPC = "https://api.devnet.solana.com";
const TEST_USDC_MINT = new PublicKey("F7RYRqCy8uWYxjxrXVhU3iUCRwa9bKBUTkGKktpyYueQ");
const ESCROW_WALLET = new PublicKey("Gy5cU3bNH1DKsff6rp91H1BmtEfwspziR52WfmMVfbPZ"); // deployer = escrow
const USDC_DECIMALS = 6;

/**
 * Build a SPL token transfer transaction for the user to sign.
 * Returns the serialized transaction (base64) ready for wallet signing.
 */
export async function buildEscrowLockTransaction(
  posterWallet: string,
  amount: number,
): Promise<{ transaction: string; escrowAta: string; posterAta: string }> {
  const connection = new Connection(DEVNET_RPC, "confirmed");
  const posterPubkey = new PublicKey(posterWallet);

  const posterAta = await getAssociatedTokenAddress(TEST_USDC_MINT, posterPubkey);
  const escrowAta = await getAssociatedTokenAddress(TEST_USDC_MINT, ESCROW_WALLET);

  const tx = new Transaction();

  // Check if escrow ATA exists, create if not
  try {
    await getAccount(connection, escrowAta);
  } catch {
    tx.add(createAssociatedTokenAccountInstruction(posterPubkey, escrowAta, ESCROW_WALLET, TEST_USDC_MINT));
  }

  // Add transfer instruction
  const tokenAmount = BigInt(Math.round(amount * Math.pow(10, USDC_DECIMALS)));
  tx.add(createTransferInstruction(posterAta, escrowAta, posterPubkey, tokenAmount, [], TOKEN_PROGRAM_ID));

  // Set recent blockhash and fee payer
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = posterPubkey;

  // Serialize (unsigned -- user will sign via wallet)
  const serialized = tx.serialize({ requireAllSignatures: false }).toString("base64");

  return { transaction: serialized, escrowAta: escrowAta.toBase58(), posterAta: posterAta.toBase58() };
}

/**
 * Check if user has enough USDC balance
 */
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
