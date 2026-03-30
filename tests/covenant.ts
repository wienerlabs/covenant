import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Covenant } from "../target/types/covenant";
import {
  createMint,
  createAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { assert } from "chai";

describe("covenant", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Covenant as Program<Covenant>;
  const poster = provider.wallet;

  let mint: PublicKey;
  let posterTokenAccount: PublicKey;
  let escrowTokenAccount: Keypair;
  let jobEscrowPda: PublicKey;
  let jobEscrowBump: number;

  const specHash = new Uint8Array(32);
  specHash.fill(0);
  specHash[0] = 0xab;
  specHash[1] = 0xcd;

  const depositAmount = new anchor.BN(1_000_000); // 1 USDC (6 decimals)
  const mintAuthority = Keypair.generate();

  it("poster can create a job and USDC is locked in escrow", async () => {
    // Create a mock USDC mint
    mint = await createMint(
      provider.connection,
      (poster as any).payer,
      mintAuthority.publicKey,
      null,
      6, // 6 decimals like USDC
    );

    // Create poster's token account and fund it
    posterTokenAccount = await createAccount(
      provider.connection,
      (poster as any).payer,
      mint,
      poster.publicKey,
    );

    await mintTo(
      provider.connection,
      (poster as any).payer,
      mint,
      posterTokenAccount,
      mintAuthority,
      10_000_000, // 10 USDC
    );

    // Derive the job escrow PDA
    [jobEscrowPda, jobEscrowBump] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("job"),
        poster.publicKey.toBuffer(),
        Buffer.from(specHash),
      ],
      program.programId,
    );

    // Generate a keypair for the escrow token account
    escrowTokenAccount = Keypair.generate();

    // Set deadline to 1 hour from now
    const now = Math.floor(Date.now() / 1000);
    const deadline = new anchor.BN(now + 3600);

    // Record poster balance before
    const posterBefore = await getAccount(provider.connection, posterTokenAccount);
    const posterBalanceBefore = Number(posterBefore.amount);

    // Call create_job
    await program.methods
      .createJob(depositAmount, Array.from(specHash), deadline)
      .accounts({
        poster: poster.publicKey,
        jobEscrow: jobEscrowPda,
        escrowTokenAccount: escrowTokenAccount.publicKey,
        posterTokenAccount: posterTokenAccount,
        tokenMint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([escrowTokenAccount])
      .rpc();

    // Fetch job escrow account
    const jobAccount = await program.account.jobEscrow.fetch(jobEscrowPda);

    // Assert status == Open
    assert.deepEqual(jobAccount.status, { open: {} });

    // Assert spec_hash matches input
    const storedHash = Buffer.from(jobAccount.specHash);
    const inputHash = Buffer.from(specHash);
    assert.isTrue(storedHash.equals(inputHash), "spec_hash must match input");

    // Assert escrow token account balance == deposited amount
    const escrowAccount = await getAccount(
      provider.connection,
      escrowTokenAccount.publicKey,
    );
    assert.equal(
      Number(escrowAccount.amount),
      depositAmount.toNumber(),
      "Escrow token account must hold the deposited amount",
    );

    // Assert poster token account decreased by amount
    const posterAfter = await getAccount(provider.connection, posterTokenAccount);
    const posterBalanceAfter = Number(posterAfter.amount);
    assert.equal(
      posterBalanceBefore - posterBalanceAfter,
      depositAmount.toNumber(),
      "Poster balance must decrease by the deposit amount",
    );
  });

  const taker = Keypair.generate();

  it("taker can accept an open job", async () => {
    // Airdrop SOL to taker for tx fees
    const sig = await provider.connection.requestAirdrop(
      taker.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig);

    await program.methods
      .acceptJob(Array.from(specHash))
      .accounts({
        taker: taker.publicKey,
        jobEscrow: jobEscrowPda,
        poster: poster.publicKey,
      })
      .signers([taker])
      .rpc();

    const jobAccount = await program.account.jobEscrow.fetch(jobEscrowPda);

    // Assert status == Accepted
    assert.deepEqual(jobAccount.status, { accepted: {} });

    // Assert taker matches
    assert.isTrue(
      jobAccount.taker.equals(taker.publicKey),
      "JobEscrow.taker must equal taker pubkey",
    );
  });

  it("taker cannot accept with wrong spec hash", async () => {
    // Create a second job so we have a fresh Open job to test against
    const specHash2 = new Uint8Array(32);
    specHash2.fill(0);
    specHash2[0] = 0xff;
    specHash2[1] = 0xee;

    const [jobPda2] = PublicKey.findProgramAddressSync(
      [Buffer.from("job"), poster.publicKey.toBuffer(), Buffer.from(specHash2)],
      program.programId,
    );
    const escrowTa2 = Keypair.generate();
    const now = Math.floor(Date.now() / 1000);

    await program.methods
      .createJob(depositAmount, Array.from(specHash2), new anchor.BN(now + 3600))
      .accounts({
        poster: poster.publicKey,
        jobEscrow: jobPda2,
        escrowTokenAccount: escrowTa2.publicKey,
        posterTokenAccount: posterTokenAccount,
        tokenMint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([escrowTa2])
      .rpc();

    // Now try to accept with a wrong hash
    const wrongHash = new Uint8Array(32);
    wrongHash.fill(0);
    wrongHash[0] = 0xde;
    wrongHash[1] = 0xad;

    try {
      await program.methods
        .acceptJob(Array.from(wrongHash))
        .accounts({
          taker: taker.publicKey,
          jobEscrow: jobPda2,
          poster: poster.publicKey,
        })
        .signers([taker])
        .rpc();
      assert.fail("Should have thrown SpecHashMismatch");
    } catch (err: any) {
      assert.include(err.toString(), "SpecHashMismatch");
    }
  });

  it("taker cannot accept an already accepted job", async () => {
    // The first job (jobEscrowPda) is already Accepted from the earlier test
    const taker2 = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(
      taker2.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig);

    try {
      await program.methods
        .acceptJob(Array.from(specHash))
        .accounts({
          taker: taker2.publicKey,
          jobEscrow: jobEscrowPda,
          poster: poster.publicKey,
        })
        .signers([taker2])
        .rpc();
      assert.fail("Should have thrown InvalidStatus");
    } catch (err: any) {
      assert.include(err.toString(), "InvalidStatus");
    }
  });

  it("submit_completion fails with invalid proof", async () => {
    // Create taker's token account to receive payment
    const takerTokenAccount = await createAccount(
      provider.connection,
      (poster as any).payer,
      mint,
      taker.publicKey,
    );

    // Use garbage bytes as proof — the Groth16 verifier must reject this
    const fakeProof = Buffer.alloc(260, 0xaa);
    const minWords = 500;
    const textHash = new Uint8Array(32).fill(0xbb);

    try {
      await program.methods
        .submitCompletion(
          Buffer.from(fakeProof),
          minWords,
          Array.from(textHash),
        )
        .accounts({
          taker: taker.publicKey,
          jobEscrow: jobEscrowPda,
          poster: poster.publicKey,
          escrowTokenAccount: escrowTokenAccount.publicKey,
          takerTokenAccount: takerTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([taker])
        .rpc();
      assert.fail("Should have thrown InvalidProof");
    } catch (err: any) {
      assert.include(err.toString(), "InvalidProof");
    }

    // Verify job is still Accepted (not Completed) after failed proof
    const jobAccount = await program.account.jobEscrow.fetch(jobEscrowPda);
    assert.deepEqual(jobAccount.status, { accepted: {} });
  });

  it("submit_completion fails when job is not Accepted", async () => {
    // Create a brand new Open job (not yet accepted) and try to submit
    const specHash3 = new Uint8Array(32);
    specHash3.fill(0);
    specHash3[0] = 0x11;
    specHash3[1] = 0x22;

    const [jobPda3] = PublicKey.findProgramAddressSync(
      [Buffer.from("job"), poster.publicKey.toBuffer(), Buffer.from(specHash3)],
      program.programId,
    );
    const escrowTa3 = Keypair.generate();
    const now = Math.floor(Date.now() / 1000);

    await program.methods
      .createJob(depositAmount, Array.from(specHash3), new anchor.BN(now + 3600))
      .accounts({
        poster: poster.publicKey,
        jobEscrow: jobPda3,
        escrowTokenAccount: escrowTa3.publicKey,
        posterTokenAccount: posterTokenAccount,
        tokenMint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([escrowTa3])
      .rpc();

    // Use a fresh keypair for the taker token account to avoid ATA collision
    const takerTaKeypair = Keypair.generate();
    const takerTokenAccount = await createAccount(
      provider.connection,
      (poster as any).payer,
      mint,
      taker.publicKey,
      takerTaKeypair,
    );

    const fakeProof = Buffer.alloc(260, 0xaa);

    try {
      await program.methods
        .submitCompletion(
          Buffer.from(fakeProof),
          500,
          Array.from(new Uint8Array(32)),
        )
        .accounts({
          taker: taker.publicKey,
          jobEscrow: jobPda3,
          poster: poster.publicKey,
          escrowTokenAccount: escrowTa3.publicKey,
          takerTokenAccount: takerTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([taker])
        .rpc();
      assert.fail("Should have thrown InvalidStatus");
    } catch (err: any) {
      assert.include(err.toString(), "InvalidStatus");
    }
  });

  it("cancels a job", async () => {
    // TODO: Implement test
  });
});
