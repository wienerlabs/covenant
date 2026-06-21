#!/usr/bin/env node
/**
 * Covenant — protocol config initializer (devnet).
 *
 * After deploying the Anchor program to a fresh devnet program ID,
 * the on-chain ProtocolConfig PDA must be initialized exactly once
 * via the `init_config` instruction. Without this:
 *   - create_job rejects every call (challenge_period bounds unset)
 *   - raise_dispute can't validate bond amounts
 *   - resolve_dispute can't form the arbitrator multisig
 *
 * This script wraps that one-time call. Idempotent — exits early if
 * the config PDA already exists.
 *
 * Usage:
 *   ARBITRATOR_1=<pubkey> ARBITRATOR_2=<pubkey> ARBITRATOR_3=<pubkey> \
 *   node scripts/init-config.mjs
 *
 * Required env:
 *   DEPLOYER_KEYPAIR    JSON array of 64 secret-key bytes (the program
 *                       upgrade authority — typically the same wallet
 *                       used to `solana program deploy`).
 *   ARBITRATOR_1/2/3    Three pubkeys forming the dispute multisig.
 *
 * Optional env:
 *   ARBITRATOR_THRESHOLD             default 2 (2-of-3)
 *   MIN_CHALLENGE_PERIOD_SECONDS     default 3600 (1h)
 *   MAX_CHALLENGE_PERIOD_SECONDS     default 604800 (7d)
 *   MIN_BOND_BPS                     default 500 (5% of job amount)
 *   MIN_BOND_ABSOLUTE_USDC           default 1.0 (1 USDC absolute floor)
 */

import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- env ----
const PROGRAM_ID_STR =
  process.env.NEXT_PUBLIC_PROGRAM_ID_DEVNET ||
  process.env.NEXT_PUBLIC_PROGRAM_ID ||
  "5hstj5grBUL1BeSaPLYpgkD6n3ALasmbseRvKRFfCVNT";
const PROGRAM_ID = new PublicKey(PROGRAM_ID_STR);

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ||
  process.env.HELIUS_RPC_URL ||
  "https://api.devnet.solana.com";

const ARBS = [process.env.ARBITRATOR_1, process.env.ARBITRATOR_2, process.env.ARBITRATOR_3];
const THRESHOLD = Number(process.env.ARBITRATOR_THRESHOLD ?? 2);
const MIN_CHAL = BigInt(process.env.MIN_CHALLENGE_PERIOD_SECONDS ?? 3600);
const MAX_CHAL = BigInt(process.env.MAX_CHALLENGE_PERIOD_SECONDS ?? 604800);
const MIN_BOND_BPS = Number(process.env.MIN_BOND_BPS ?? 500);
const MIN_BOND_ABS_USDC = Number(process.env.MIN_BOND_ABSOLUTE_USDC ?? 1);

// ---- validate ----
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

if (!process.env.DEPLOYER_KEYPAIR) fail("DEPLOYER_KEYPAIR env var is required.");
ARBS.forEach((a, i) => {
  if (!a) fail(`ARBITRATOR_${i + 1} env var is required.`);
  try {
    new PublicKey(a);
  } catch {
    fail(`ARBITRATOR_${i + 1} is not a valid Solana pubkey: ${a}`);
  }
});
if (THRESHOLD < 1 || THRESHOLD > 3) fail("ARBITRATOR_THRESHOLD must be 1, 2, or 3.");
if (MAX_CHAL <= MIN_CHAL) fail("MAX_CHALLENGE_PERIOD must exceed MIN_CHALLENGE_PERIOD.");

// ---- run ----
async function main() {
  console.log(`▶ Cluster: devnet`);
  console.log(`▶ Program: ${PROGRAM_ID.toBase58()}`);
  console.log(`▶ RPC:     ${RPC_URL}`);

  const deployerKp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(process.env.DEPLOYER_KEYPAIR)),
  );
  console.log(`▶ Deployer: ${deployerKp.publicKey.toBase58()}`);

  const conn = new Connection(RPC_URL, "confirmed");

  // Idempotency check — if the config PDA already exists, bail.
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    PROGRAM_ID,
  );
  console.log(`▶ Config PDA: ${configPda.toBase58()}`);

  // init_config is gated on the program's upgrade authority, so the call
  // must include the program + its ProgramData account (canonical PDA
  // [programId] under the BPF upgradeable loader). The DEPLOYER_KEYPAIR must
  // be the program's upgrade authority for this to succeed.
  const BPF_UPGRADEABLE_LOADER = new PublicKey(
    "BPFLoaderUpgradeab1e11111111111111111111111",
  );
  const [programData] = PublicKey.findProgramAddressSync(
    [PROGRAM_ID.toBuffer()],
    BPF_UPGRADEABLE_LOADER,
  );
  console.log(`▶ ProgramData PDA: ${programData.toBase58()}`);

  const existing = await conn.getAccountInfo(configPda);
  if (existing) {
    console.log("✓ ProtocolConfig already initialized — nothing to do.");
    process.exit(0);
  }

  // Load IDL from the app's bundled copy so we don't need a separate
  // anchor build artifact.
  const idlPath = path.join(__dirname, "..", "lib", "covenant-idl.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));

  const wallet = new Wallet(deployerKp);
  const provider = new AnchorProvider(conn, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  const program = new Program(idl, provider);

  const arbPubkeys = ARBS.map((a) => new PublicKey(a));
  const minBondAbsAtomic = new BN(Math.round(MIN_BOND_ABS_USDC * 1_000_000));

  console.log("\n▶ Calling init_config with:");
  console.log(`    arbitrators: ${arbPubkeys.map((k) => k.toBase58().slice(0, 8) + "…").join(", ")}`);
  console.log(`    threshold:   ${THRESHOLD} of ${arbPubkeys.length}`);
  console.log(`    min/max challenge period: ${MIN_CHAL}s / ${MAX_CHAL}s`);
  console.log(`    min bond:    ${MIN_BOND_BPS} bps + ${MIN_BOND_ABS_USDC} USDC absolute`);

  const sig = await program.methods
    .initConfig(
      arbPubkeys,
      THRESHOLD,
      new BN(MIN_CHAL.toString()),
      new BN(MAX_CHAL.toString()),
      MIN_BOND_BPS,
      minBondAbsAtomic,
    )
    .accounts({
      admin: deployerKp.publicKey,
      config: configPda,
      program: PROGRAM_ID,
      programData,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: "confirmed" });

  console.log(`\n✓ ProtocolConfig initialized. Tx:`);
  console.log(`  https://explorer.solana.com/tx/${sig}?cluster=devnet`);
}

main().catch((err) => {
  console.error("\n✗ init_config failed:", err);
  process.exit(1);
});
