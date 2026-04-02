import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createTransferInstruction,
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

// Convert human-readable amount to token amount (with decimals)
function toTokenAmount(amount: number): bigint {
  return BigInt(Math.round(amount * Math.pow(10, USDC_DECIMALS)));
}

// Get or create ATA for a wallet
async function ensureATA(connection: Connection, payer: Keypair, owner: PublicKey): Promise<PublicKey> {
  const ata = await getAssociatedTokenAddress(TEST_USDC_MINT, owner);
  try {
    await getAccount(connection, ata);
    return ata;
  } catch {
    // ATA doesn't exist, create it
    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(payer.publicKey, ata, owner, TEST_USDC_MINT)
    );
    await connection.sendTransaction(tx, [payer]);
    // Wait a bit for confirmation
    await new Promise((r) => setTimeout(r, 1000));
    return ata;
  }
}

// Lock funds: transfer from poster to escrow (deployer holds escrow)
export async function lockFundsInEscrow(
  posterKeypairEnv: string,
  amount: number
): Promise<{ txHash: string; fromAta: string; toAta: string; amount: number }> {
  const connection = getConnection();
  const poster = keypairFromEnv(posterKeypairEnv);
  const deployer = keypairFromEnv("DEPLOYER_KEYPAIR");

  const posterAta = await ensureATA(connection, deployer, poster.publicKey);
  const escrowAta = await ensureATA(connection, deployer, deployer.publicKey);

  const tokenAmount = toTokenAmount(amount);

  const tx = new Transaction().add(
    createTransferInstruction(
      posterAta,
      escrowAta,
      poster.publicKey,
      tokenAmount,
      [],
      TOKEN_PROGRAM_ID
    )
  );

  const sig = await connection.sendTransaction(tx, [poster], { skipPreflight: false });
  await connection.confirmTransaction(sig, "confirmed");

  return {
    txHash: sig,
    fromAta: posterAta.toBase58(),
    toAta: escrowAta.toBase58(),
    amount,
  };
}

// Release funds: transfer from escrow (deployer) to taker
export async function releaseFundsToTaker(
  takerWalletAddress: string,
  amount: number
): Promise<{ txHash: string; fromAta: string; toAta: string; amount: number }> {
  const connection = getConnection();
  const deployer = keypairFromEnv("DEPLOYER_KEYPAIR");
  const takerPubkey = new PublicKey(takerWalletAddress);

  const escrowAta = await ensureATA(connection, deployer, deployer.publicKey);
  const takerAta = await ensureATA(connection, deployer, takerPubkey);

  const tokenAmount = toTokenAmount(amount);

  const tx = new Transaction().add(
    createTransferInstruction(
      escrowAta,
      takerAta,
      deployer.publicKey,
      tokenAmount,
      [],
      TOKEN_PROGRAM_ID
    )
  );

  const sig = await connection.sendTransaction(tx, [deployer], { skipPreflight: false });
  await connection.confirmTransaction(sig, "confirmed");

  return {
    txHash: sig,
    fromAta: escrowAta.toBase58(),
    toAta: takerAta.toBase58(),
    amount,
  };
}

// Refund: transfer from escrow back to poster
export async function refundToPoster(
  posterKeypairEnv: string,
  amount: number
): Promise<{ txHash: string }> {
  const connection = getConnection();
  const deployer = keypairFromEnv("DEPLOYER_KEYPAIR");
  const poster = keypairFromEnv(posterKeypairEnv);

  const escrowAta = await ensureATA(connection, deployer, deployer.publicKey);
  const posterAta = await ensureATA(connection, deployer, poster.publicKey);

  const tokenAmount = toTokenAmount(amount);

  const tx = new Transaction().add(
    createTransferInstruction(
      escrowAta,
      posterAta,
      deployer.publicKey,
      tokenAmount,
      [],
      TOKEN_PROGRAM_ID
    )
  );

  const sig = await connection.sendTransaction(tx, [deployer]);
  await connection.confirmTransaction(sig, "confirmed");

  return { txHash: sig };
}

// Mint test USDC to a wallet (for airdrop/faucet)
export async function mintTestUSDC(
  toWalletAddress: string,
  amount: number
): Promise<{ txHash: string; ata: string }> {
  const connection = getConnection();
  const deployer = keypairFromEnv("DEPLOYER_KEYPAIR");
  const toPubkey = new PublicKey(toWalletAddress);

  // Import mint function
  const { mintTo } = await import("@solana/spl-token");

  const ata = await ensureATA(connection, deployer, toPubkey);
  const tokenAmount = toTokenAmount(amount);

  const sig = await mintTo(
    connection,
    deployer,
    TEST_USDC_MINT,
    ata,
    deployer, // mint authority
    tokenAmount
  );

  return { txHash: sig, ata: ata.toBase58() };
}

// Get token balance for a wallet
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
