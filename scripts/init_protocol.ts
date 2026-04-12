/**
 * One-time protocol initialization script.
 *
 * Calls `init_config` on the deployed Covenant program to set up the
 * ProtocolConfig PDA with:
 *   - Admin: DEPLOYER wallet
 *   - Arbitrators: [DEPLOYER, AGENT_ALPHA, AGENT_OMEGA] (2-of-3)
 *   - Challenge period bounds: 60s min (demo), 7d max
 *   - Bond: 10% / 1 USDC absolute minimum
 *
 * Usage:
 *   cd app && npx ts-node ../scripts/init_protocol.ts
 *
 * Requires: DEPLOYER_KEYPAIR, AGENT_ALPHA_KEYPAIR, AGENT_OMEGA_KEYPAIR in .env
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Connection,
} from "@solana/web3.js";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

dotenv.config({ path: path.join(__dirname, "../app/.env") });

const PROGRAM_ID = new PublicKey("AJAJPkC8oRsVaSYgVh36TKbMKZtzn8kKHcQXwZEn2vrQ");

class NodeWallet {
  constructor(readonly payer: Keypair) {}
  get publicKey() { return this.payer.publicKey; }
  async signTransaction<T>(tx: T): Promise<T> {
    (tx as any).partialSign(this.payer);
    return tx;
  }
  async signAllTransactions<T>(txs: T[]): Promise<T[]> {
    txs.forEach((tx) => (tx as any).partialSign(this.payer));
    return txs;
  }
}

function loadKeypair(envVar: string): Keypair {
  const raw = process.env[envVar];
  if (!raw) throw new Error(`${envVar} not set in .env`);
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

async function main() {
  const rpc = process.env.HELIUS_RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(rpc, "confirmed");

  const deployer = loadKeypair("DEPLOYER_KEYPAIR");
  const alphaKp = loadKeypair("AGENT_ALPHA_KEYPAIR");
  const omegaKp = loadKeypair("AGENT_OMEGA_KEYPAIR");

  console.log("Program ID:", PROGRAM_ID.toBase58());
  console.log("Admin (deployer):", deployer.publicKey.toBase58());
  console.log("Arbitrator 1 (deployer):", deployer.publicKey.toBase58());
  console.log("Arbitrator 2 (alpha):", alphaKp.publicKey.toBase58());
  console.log("Arbitrator 3 (omega):", omegaKp.publicKey.toBase58());

  const wallet = new NodeWallet(deployer);
  const provider = new AnchorProvider(connection, wallet as any, {
    commitment: "confirmed",
  });

  const idl = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../app/lib/covenant-idl.json"), "utf8")
  );
  const program = new Program(idl, provider) as any;

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    PROGRAM_ID,
  );
  console.log("Config PDA:", configPda.toBase58());

  // Check if already initialized
  try {
    const existing = await program.account.protocolConfig.fetch(configPda);
    console.log("\nProtocol config ALREADY INITIALIZED:");
    console.log("  Admin:", existing.admin.toBase58());
    console.log("  Threshold:", existing.threshold);
    console.log("  Min challenge:", existing.minChallengePeriod.toString(), "s");
    console.log("  Max challenge:", existing.maxChallengePeriod.toString(), "s");
    console.log("  Bond BPS:", existing.minBondBps);
    console.log("  Bond absolute:", existing.minBondAbsolute.toString());
    console.log("\nSkipping init_config. Use update_arbitrators to rotate.");
    return;
  } catch {
    // Not initialized yet — proceed
  }

  console.log("\nInitializing protocol config...");

  const sig = await program.methods
    .initConfig(
      [deployer.publicKey, alphaKp.publicKey, omegaKp.publicKey],
      2, // threshold: 2-of-3
      new BN(60),        // min challenge period: 60s (demo-friendly)
      new BN(604800),    // max challenge period: 7 days
      1000,              // min bond BPS: 10%
      new BN(1_000_000), // min bond absolute: 1 USDC
    )
    .accounts({
      admin: deployer.publicKey,
      config: configPda,
      systemProgram: SystemProgram.programId,
    })
    .signers([deployer])
    .rpc();

  console.log("\ninit_config tx:", sig);
  console.log("Explorer: https://explorer.solana.com/tx/" + sig + "?cluster=devnet");

  // Verify
  const config = await program.account.protocolConfig.fetch(configPda);
  console.log("\nVerification:");
  console.log("  Admin:", config.admin.toBase58());
  console.log("  Threshold:", config.threshold);
  console.log("  Arbitrators:", config.arbitrators.map((a: PublicKey) => a.toBase58()));
  console.log("  Min challenge:", config.minChallengePeriod.toString(), "s");
  console.log("  Bond BPS:", config.minBondBps);
  console.log("\nDone!");
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
