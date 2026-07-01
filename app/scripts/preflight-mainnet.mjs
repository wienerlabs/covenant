#!/usr/bin/env node
/**
 * Covenant — mainnet deploy PREFLIGHT.
 *
 * Read-only go/no-go check before a mainnet deployment. It does NOT deploy,
 * spend SOL, or sign anything — it validates that the pieces are in place and
 * prints the exact commands to run next. Run it against your mainnet RPC with
 * the deployer keypair available.
 *
 * Usage:
 *   DEPLOYER_KEYPAIR='[...]' \
 *   NEXT_PUBLIC_RPC_URL_MAINNET='https://mainnet.helius-rpc.com/?api-key=...' \
 *   node scripts/preflight-mainnet.mjs
 *
 * Optional env:
 *   NEXT_PUBLIC_PROGRAM_ID_MAINNET   already-deployed program ID (post-deploy check)
 *   MIN_DEPLOY_SOL                   required balance (default 6)
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

const MAINNET_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const DEVNET_PROGRAM_ID = "5hstj5grBUL1BeSaPLYpgkD6n3ALasmbseRvKRFfCVNT";
const MIN_SOL = Number(process.env.MIN_DEPLOY_SOL ?? 6);

const RPC =
  process.env.NEXT_PUBLIC_RPC_URL_MAINNET ||
  process.env.SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

let warn = 0;
let fail = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { console.log(`  ✗ ${m}`); fail++; };
const soft = (m) => { console.log(`  ! ${m}`); warn++; };

async function main() {
  console.log("\n▶ Covenant mainnet preflight");
  console.log(`▶ RPC: ${RPC}`);

  if (!/mainnet/i.test(RPC) && !RPC.includes("helius") && !RPC.includes("quiknode") && !RPC.includes("triton")) {
    soft("RPC URL does not obviously point at mainnet — double-check it.");
  }

  const conn = new Connection(RPC, "confirmed");
  try {
    const genesis = await conn.getGenesisHash();
    // Mainnet-beta genesis hash is well-known.
    if (genesis === "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d") ok("RPC is on mainnet-beta.");
    else bad(`RPC genesis ${genesis} is NOT mainnet-beta. Aborting checks that assume mainnet.`);
  } catch (e) {
    bad(`Could not reach RPC: ${e.message}`);
  }

  // Deployer keypair + balance
  if (!process.env.DEPLOYER_KEYPAIR) {
    soft("DEPLOYER_KEYPAIR not set — skipping balance check (fine if you deploy with a hardware/Squads signer).");
  } else {
    try {
      const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.DEPLOYER_KEYPAIR)));
      console.log(`▶ Deployer: ${kp.publicKey.toBase58()}`);
      const bal = (await conn.getBalance(kp.publicKey)) / LAMPORTS_PER_SOL;
      if (bal >= MIN_SOL) ok(`Deployer balance ${bal.toFixed(3)} SOL (>= ${MIN_SOL}).`);
      else bad(`Deployer balance ${bal.toFixed(3)} SOL is below the ~${MIN_SOL} SOL needed for program deploy + rent.`);
    } catch (e) {
      bad(`DEPLOYER_KEYPAIR invalid: ${e.message}`);
    }
  }

  // USDC mint sanity
  try {
    const info = await conn.getAccountInfo(new PublicKey(MAINNET_USDC));
    if (info) ok(`Canonical USDC mint reachable (${MAINNET_USDC.slice(0, 8)}…).`);
    else soft("Could not read the USDC mint account (RPC may be rate-limited).");
  } catch { soft("USDC mint check skipped (RPC error)."); }

  // Program ID sanity
  const pid = process.env.NEXT_PUBLIC_PROGRAM_ID_MAINNET;
  if (!pid) {
    soft("NEXT_PUBLIC_PROGRAM_ID_MAINNET not set yet — expected BEFORE first deploy. Set it AFTER deploying.");
  } else if (pid === DEVNET_PROGRAM_ID) {
    bad("NEXT_PUBLIC_PROGRAM_ID_MAINNET is the DEVNET program ID. Deploy a fresh mainnet program and use its ID.");
  } else {
    try {
      const acc = await conn.getAccountInfo(new PublicKey(pid));
      if (acc?.executable) ok(`Program ${pid.slice(0, 8)}… is deployed + executable on mainnet.`);
      else bad(`Program ${pid.slice(0, 8)}… is not executable on mainnet (not deployed yet?).`);
    } catch (e) { bad(`Program ID invalid: ${e.message}`); }
  }

  console.log("\n── next commands (once green) ──");
  console.log("  1. anchor build");
  console.log("  2. solana program deploy --url $RPC --keypair <deployer> \\");
  console.log("       target/deploy/covenant.so --program-id target/deploy/covenant-mainnet.json");
  console.log("  3. COVENANT_ENV=mainnet node scripts/init-config.mjs   # real arbitrators");
  console.log("  4. Set Vercel prod env (COVENANT_ENV=mainnet, SETTLEMENT_MODE=onchain, RPC, program id, SESSION_SECRET)\n");

  console.log(`Result: ${fail} blocker(s), ${warn} warning(s).`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("preflight crashed:", e); process.exit(1); });
