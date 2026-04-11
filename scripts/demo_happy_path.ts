/**
 * Demo script: happy path end-to-end.
 *
 * Walks the protocol through:
 *   1. Create a 5 USDC job with a 60-second compressed challenge period
 *   2. Taker accepts
 *   3. Taker submits work (content + work_hash + delivery_uri)
 *   4. Wait for challenge period to expire
 *   5. Anyone calls finalize_payment → escrow releases to taker
 *
 * Usage:
 *   ANCHOR_PROVIDER_URL=https://devnet.helius-rpc.com/?api-key=...  \
 *   ANCHOR_WALLET=~/.config/solana/id.json                          \
 *   ts-node scripts/demo_happy_path.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import crypto from "crypto";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const covenant: any = (anchor as any).workspace?.Covenant;

const DEMO_CHALLENGE_SECONDS = 60;

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = covenant as Program<any>;
  const admin = provider.wallet;

  console.log("=== Covenant happy path demo ===\n");
  console.log("Program ID:", program.programId.toBase58());

  const poster = Keypair.generate();
  const taker = Keypair.generate();

  // Fund test wallets
  for (const kp of [poster, taker]) {
    const sig = await provider.connection.requestAirdrop(
      kp.publicKey,
      2 * LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig);
  }

  // Test mint
  console.log("Creating test mint...");
  const mint = await createMint(
    provider.connection,
    (admin as anchor.Wallet).payer,
    admin.publicKey,
    null,
    6,
  );
  const posterAta = await createAssociatedTokenAccount(
    provider.connection,
    (admin as anchor.Wallet).payer,
    mint,
    poster.publicKey,
  );
  const takerAta = await createAssociatedTokenAccount(
    provider.connection,
    (admin as anchor.Wallet).payer,
    mint,
    taker.publicKey,
  );
  await mintTo(
    provider.connection,
    (admin as anchor.Wallet).payer,
    mint,
    posterAta,
    admin.publicKey,
    100_000_000,
  );

  // Config (assumes init_config has been run once already; try init, ignore error)
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId,
  );
  try {
    const arb1 = Keypair.generate();
    const arb2 = Keypair.generate();
    const arb3 = Keypair.generate();
    await program.methods
      .initConfig(
        [arb1.publicKey, arb2.publicKey, arb3.publicKey],
        2,
        new BN(DEMO_CHALLENGE_SECONDS),
        new BN(7 * 24 * 3600),
        1_000,
        new BN(1_000_000),
      )
      .accounts({
        admin: admin.publicKey,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("Initialized protocol config.");
  } catch {
    console.log("Protocol config already initialized.");
  }

  // 1. Create job
  const specHash = crypto.randomBytes(32);
  const [jobPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("job"), poster.publicKey.toBuffer(), specHash],
    program.programId,
  );
  const escrowKp = Keypair.generate();

  console.log("\n1. Poster creates job with 5 USDC escrow, 60s challenge...");
  await program.methods
    .createJob(
      new BN(5_000_000),
      Array.from(specHash),
      new BN(Math.floor(Date.now() / 1000) + 3600),
      new BN(DEMO_CHALLENGE_SECONDS),
    )
    .accounts({
      poster: poster.publicKey,
      config: configPda,
      jobEscrow: jobPda,
      escrowTokenAccount: escrowKp.publicKey,
      posterTokenAccount: posterAta,
      tokenMint: mint,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .signers([poster, escrowKp])
    .rpc();
  console.log("   Job PDA:", jobPda.toBase58());

  // 2. Accept
  console.log("\n2. Taker accepts...");
  await program.methods
    .acceptJob(Array.from(specHash))
    .accounts({
      taker: taker.publicKey,
      jobEscrow: jobPda,
      poster: poster.publicKey,
    })
    .signers([taker])
    .rpc();

  // 3. Submit work
  console.log("\n3. Taker submits work...");
  const content = "Example deliverable content — this is a demo job.";
  const workHash = crypto.createHash("sha256").update(content).digest();
  await program.methods
    .submitWork(
      Array.from(workHash),
      "https://example.com/demo-delivery.md",
    )
    .accounts({
      taker: taker.publicKey,
      jobEscrow: jobPda,
      poster: poster.publicKey,
    })
    .signers([taker])
    .rpc();
  console.log("   work_hash:", workHash.toString("hex"));

  // 4. Wait for challenge period
  console.log(`\n4. Waiting ${DEMO_CHALLENGE_SECONDS + 5}s for challenge period...`);
  await new Promise((r) => setTimeout(r, (DEMO_CHALLENGE_SECONDS + 5) * 1000));

  // 5. Finalize
  console.log("\n5. Finalizing payment (permissionless)...");
  const [repPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("reputation"), taker.publicKey.toBuffer()],
    program.programId,
  );
  const crank = Keypair.generate();
  const sig = await provider.connection.requestAirdrop(
    crank.publicKey,
    LAMPORTS_PER_SOL,
  );
  await provider.connection.confirmTransaction(sig);

  const takerBefore = (await getAccount(provider.connection, takerAta)).amount;
  await program.methods
    .finalizePayment()
    .accounts({
      crank: crank.publicKey,
      jobEscrow: jobPda,
      poster: poster.publicKey,
      escrowTokenAccount: escrowKp.publicKey,
      takerTokenAccount: takerAta,
      taker: taker.publicKey,
      takerReputation: repPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([crank])
    .rpc();
  const takerAfter = (await getAccount(provider.connection, takerAta)).amount;

  console.log(
    `   Taker balance: ${takerBefore.toString()} -> ${takerAfter.toString()}`,
  );
  console.log(
    `   Released: ${(takerAfter - takerBefore).toString()} atomic (should be 5000000)`,
  );
  console.log("\n=== Happy path complete ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
