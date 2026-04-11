/**
 * Demo script: dispute path end-to-end.
 *
 * Walks the protocol through:
 *   1. Create a 10 USDC job
 *   2. Taker accepts and submits work
 *   3. Poster raises a dispute with 1 USDC bond
 *   4. Arbitrator 1 votes FavorPoster (1/2)
 *   5. Arbitrator 2 votes FavorPoster (2/2, threshold reached)
 *   6. Escrow refunded to poster, bond returned, job Resolved
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

const CHALLENGE_SECONDS = 3600;

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = covenant as Program<any>;
  const admin = provider.wallet;

  console.log("=== Covenant dispute path demo ===\n");

  const poster = Keypair.generate();
  const taker = Keypair.generate();
  const arb1 = Keypair.generate();
  const arb2 = Keypair.generate();
  const arb3 = Keypair.generate();

  // Airdrop
  for (const kp of [poster, taker, arb1, arb2, arb3]) {
    const sig = await provider.connection.requestAirdrop(
      kp.publicKey,
      2 * LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig);
  }

  // Mint
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
    200_000_000,
  );

  // Config (init or rotate)
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId,
  );
  try {
    await program.methods
      .initConfig(
        [arb1.publicKey, arb2.publicKey, arb3.publicKey],
        2,
        new BN(CHALLENGE_SECONDS),
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
    console.log("Initialized protocol config with 3 arbitrators.");
  } catch {
    console.log("Config exists; updating arbitrators...");
    try {
      await program.methods
        .updateArbitrators(
          [arb1.publicKey, arb2.publicKey, arb3.publicKey],
          2,
        )
        .accounts({
          admin: admin.publicKey,
          config: configPda,
        })
        .rpc();
    } catch (err) {
      console.warn("Could not update arbitrators; continuing with existing set.", err);
    }
  }

  // 1. Create + accept + deliver
  const specHash = crypto.randomBytes(32);
  const [jobPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("job"), poster.publicKey.toBuffer(), specHash],
    program.programId,
  );
  const escrowKp = Keypair.generate();

  console.log("\n1. Creating 10 USDC job...");
  await program.methods
    .createJob(
      new BN(10_000_000),
      Array.from(specHash),
      new BN(Math.floor(Date.now() / 1000) + 7200),
      new BN(CHALLENGE_SECONDS),
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

  console.log("2. Taker accepts and delivers...");
  await program.methods
    .acceptJob(Array.from(specHash))
    .accounts({
      taker: taker.publicKey,
      jobEscrow: jobPda,
      poster: poster.publicKey,
    })
    .signers([taker])
    .rpc();

  const workHash = crypto.randomBytes(32);
  await program.methods
    .submitWork(Array.from(workHash), "https://example.com/bad-delivery.md")
    .accounts({
      taker: taker.publicKey,
      jobEscrow: jobPda,
      poster: poster.publicKey,
    })
    .signers([taker])
    .rpc();

  // 3. Raise dispute
  console.log("\n3. Poster raises dispute with 1 USDC bond...");
  const [bondPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bond"), jobPda.toBuffer()],
    program.programId,
  );
  const reasonHash = crypto
    .createHash("sha256")
    .update("Work does not match spec; word count too low")
    .digest();
  await program.methods
    .raiseDispute(Array.from(reasonHash), new BN(1_000_000))
    .accounts({
      poster: poster.publicKey,
      config: configPda,
      jobEscrow: jobPda,
      bondTokenAccount: bondPda,
      posterTokenAccount: posterAta,
      tokenMint: mint,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .signers([poster])
    .rpc();

  // 4+5. Two arbitrators vote FavorPoster
  const [repPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("reputation"), taker.publicKey.toBuffer()],
    program.programId,
  );

  console.log("\n4. Arbitrator 1 votes FavorPoster (1/2)...");
  await program.methods
    .resolveDispute({ favorPoster: {} })
    .accounts({
      arbitrator: arb1.publicKey,
      config: configPda,
      jobEscrow: jobPda,
      poster: poster.publicKey,
      escrowTokenAccount: escrowKp.publicKey,
      bondTokenAccount: bondPda,
      posterTokenAccount: posterAta,
      takerTokenAccount: takerAta,
      taker: taker.publicKey,
      takerReputation: repPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([arb1])
    .rpc();

  const posterBefore = (await getAccount(provider.connection, posterAta)).amount;
  console.log("\n5. Arbitrator 2 votes FavorPoster (2/2, threshold reached)...");
  await program.methods
    .resolveDispute({ favorPoster: {} })
    .accounts({
      arbitrator: arb2.publicKey,
      config: configPda,
      jobEscrow: jobPda,
      poster: poster.publicKey,
      escrowTokenAccount: escrowKp.publicKey,
      bondTokenAccount: bondPda,
      posterTokenAccount: posterAta,
      takerTokenAccount: takerAta,
      taker: taker.publicKey,
      takerReputation: repPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([arb2])
    .rpc();
  const posterAfter = (await getAccount(provider.connection, posterAta)).amount;

  console.log(
    `   Poster refunded: ${(posterAfter - posterBefore).toString()} atomic (escrow 10 + bond 1 = 11 USDC)`,
  );
  console.log("\n=== Dispute path complete ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
