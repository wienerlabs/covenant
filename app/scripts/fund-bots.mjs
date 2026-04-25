#!/usr/bin/env node
/**
 * Covenant — fund bot wallets with SOL + USDC.
 *
 * After mainnet program deploy + init_config, the autonomous /
 * arena / battle agents need:
 *   - SOL for transaction fees
 *   - USDC to post jobs (in autonomous + arena modes)
 *
 * On devnet the on-page faucet handles this for the user. On
 * mainnet the bots run with real funds and must be topped up by
 * an operator. This script transfers from a SOURCE keypair to
 * each configured bot wallet.
 *
 * Usage:
 *   SOURCE_KEYPAIR=$(cat ~/.config/solana/id.json | jq -c .) \
 *   AGENT_ALPHA_WALLET=<pubkey> \
 *   AGENT_OMEGA_WALLET=<pubkey> \
 *   DEPLOYER_WALLET=<pubkey> \
 *   SOL_PER_BOT=0.05 \
 *   USDC_PER_BOT=10 \
 *   NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta \
 *   node scripts/fund-bots.mjs
 *
 * Set DRY_RUN=1 to see the plan without sending.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const CLUSTER = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "devnet").toLowerCase();
const IS_MAINNET = CLUSTER === "mainnet-beta";
const DRY_RUN = process.env.DRY_RUN === "1";

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ||
  process.env.HELIUS_RPC_URL ||
  (IS_MAINNET
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com");

const USDC_MINT = new PublicKey(
  IS_MAINNET
    ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    : "F7RYRqCy8uWYxjxrXVhU3iUCRwa9bKBUTkGKktpyYueQ",
);

const SOL_PER_BOT = Number(process.env.SOL_PER_BOT ?? 0.02);
const USDC_PER_BOT = Number(process.env.USDC_PER_BOT ?? 5);

const targets = [
  { label: "Agent Alpha", pubkey: process.env.AGENT_ALPHA_WALLET },
  { label: "Agent Omega", pubkey: process.env.AGENT_OMEGA_WALLET },
  { label: "Deployer / bot ", pubkey: process.env.DEPLOYER_WALLET },
].filter((t) => !!t.pubkey);

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

if (!process.env.SOURCE_KEYPAIR) fail("SOURCE_KEYPAIR env var is required.");
if (targets.length === 0) {
  fail("No bot wallets configured. Set AGENT_ALPHA_WALLET / AGENT_OMEGA_WALLET / DEPLOYER_WALLET.");
}
targets.forEach((t) => {
  try {
    new PublicKey(t.pubkey);
  } catch {
    fail(`${t.label} pubkey is malformed: ${t.pubkey}`);
  }
});

async function ensureAta(conn, src, ownerPk) {
  const ata = await getAssociatedTokenAddress(USDC_MINT, ownerPk);
  const info = await conn.getAccountInfo(ata);
  if (info) return { ata, created: false };
  if (DRY_RUN) {
    console.log(`  DRY: would create ATA ${ata.toBase58().slice(0, 8)}… for ${ownerPk.toBase58().slice(0, 8)}…`);
    return { ata, created: true };
  }
  const tx = new Transaction().add(
    createAssociatedTokenAccountInstruction(src.publicKey, ata, ownerPk, USDC_MINT),
  );
  const sig = await sendAndConfirmTransaction(conn, tx, [src], { commitment: "confirmed" });
  console.log(`  + Created USDC ATA ${ata.toBase58().slice(0, 8)}…  tx: ${sig.slice(0, 12)}…`);
  return { ata, created: true };
}

async function main() {
  console.log(`▶ Cluster: ${CLUSTER}${DRY_RUN ? "  [DRY RUN]" : ""}`);
  console.log(`▶ RPC:     ${RPC_URL}`);
  console.log(`▶ USDC:    ${USDC_MINT.toBase58()}`);

  const src = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(process.env.SOURCE_KEYPAIR)),
  );
  const conn = new Connection(RPC_URL, "confirmed");

  const srcSol = await conn.getBalance(src.publicKey);
  console.log(`▶ Source ${src.publicKey.toBase58()} balance: ${(srcSol / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  const totalSol = SOL_PER_BOT * targets.length;
  const totalUsdc = USDC_PER_BOT * targets.length;
  console.log(`\n▶ Plan: ${SOL_PER_BOT} SOL + ${USDC_PER_BOT} USDC per bot × ${targets.length} bots`);
  console.log(`        = ${totalSol} SOL + ${totalUsdc} USDC total\n`);

  if (IS_MAINNET && !DRY_RUN) {
    console.log("⚠ MAINNET — sending real funds. Press Ctrl+C within 5s to abort.");
    await new Promise((r) => setTimeout(r, 5000));
  }

  // Source's USDC ATA must exist + hold enough USDC
  const srcAta = await getAssociatedTokenAddress(USDC_MINT, src.publicKey);
  const srcAtaInfo = await conn.getAccountInfo(srcAta);
  if (!srcAtaInfo && totalUsdc > 0) {
    fail(`Source has no USDC ATA at ${srcAta.toBase58()}. Fund the source wallet with USDC first.`);
  }

  for (const t of targets) {
    const ownerPk = new PublicKey(t.pubkey);
    console.log(`\n→ ${t.label} (${ownerPk.toBase58()})`);

    // SOL transfer
    if (SOL_PER_BOT > 0) {
      const lamports = Math.floor(SOL_PER_BOT * LAMPORTS_PER_SOL);
      if (DRY_RUN) {
        console.log(`  DRY: would send ${SOL_PER_BOT} SOL`);
      } else {
        const tx = new Transaction().add(
          SystemProgram.transfer({ fromPubkey: src.publicKey, toPubkey: ownerPk, lamports }),
        );
        const sig = await sendAndConfirmTransaction(conn, tx, [src], { commitment: "confirmed" });
        console.log(`  + Sent ${SOL_PER_BOT} SOL  tx: ${sig.slice(0, 12)}…`);
      }
    }

    // USDC transfer
    if (USDC_PER_BOT > 0) {
      const { ata: destAta } = await ensureAta(conn, src, ownerPk);
      const amountAtomic = BigInt(Math.round(USDC_PER_BOT * 1_000_000));
      if (DRY_RUN) {
        console.log(`  DRY: would send ${USDC_PER_BOT} USDC to ${destAta.toBase58().slice(0, 8)}…`);
      } else {
        const tx = new Transaction().add(
          createTransferCheckedInstruction(
            srcAta,
            USDC_MINT,
            destAta,
            src.publicKey,
            amountAtomic,
            6,
          ),
        );
        const sig = await sendAndConfirmTransaction(conn, tx, [src], { commitment: "confirmed" });
        console.log(`  + Sent ${USDC_PER_BOT} USDC  tx: ${sig.slice(0, 12)}…`);
      }
    }
  }

  console.log("\n✓ Done.");
}

main().catch((err) => {
  console.error("\n✗ fund-bots failed:", err);
  process.exit(1);
});
