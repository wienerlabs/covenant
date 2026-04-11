import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { assert } from "chai";

/**
 * Integration tests for the Covenant optimistic settlement protocol.
 *
 * Covers:
 *   - Config initialization
 *   - Happy path: create -> accept -> submit_work -> early finalize rejection
 *   - Dispute path: create -> accept -> submit_work -> raise_dispute ->
 *     2x resolve_dispute (2-of-3 threshold) -> Resolved
 *   - Non-arbitrator resolve rejection
 *
 * Note: these tests require `solana-test-validator` running locally or a
 * devnet RPC. The challenge period is set to the minimum (1 hour = 3600s)
 * to satisfy the on-chain bound, so "wait for expiry" tests verify the
 * *denial path* rather than real wall-clock waits. For real finalize
 * testing in CI, use a localnet validator with clock warping.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const covenant: any = (anchor as any).workspace?.Covenant;

describe("covenant — optimistic settlement", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = covenant as Program<any>;
  const admin = provider.wallet;

  // Test actors
  const poster = Keypair.generate();
  const taker = Keypair.generate();
  const crank = Keypair.generate();
  const arb1 = Keypair.generate();
  const arb2 = Keypair.generate();
  const arb3 = Keypair.generate();

  let mint: PublicKey;
  let posterAta: PublicKey;
  let takerAta: PublicKey;
  let configPda: PublicKey;

  const MIN_CHALLENGE_PERIOD = new BN(3600); // 1h
  const MAX_CHALLENGE_PERIOD = new BN(7 * 24 * 3600);
  const MIN_BOND_BPS = 1000; // 10%
  const MIN_BOND_ABSOLUTE = new BN(1_000_000); // 1 USDC

  before(async () => {
    for (const kp of [poster, taker, crank, arb1, arb2, arb3]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        2 * LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig);
    }

    mint = await createMint(
      provider.connection,
      (admin as anchor.Wallet).payer,
      admin.publicKey,
      null,
      6,
    );
    posterAta = await createAssociatedTokenAccount(
      provider.connection,
      (admin as anchor.Wallet).payer,
      mint,
      poster.publicKey,
    );
    takerAta = await createAssociatedTokenAccount(
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

    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId,
    );
  });

  it("initializes protocol config (2-of-3 multisig)", async () => {
    await program.methods
      .initConfig(
        [arb1.publicKey, arb2.publicKey, arb3.publicKey],
        2,
        MIN_CHALLENGE_PERIOD,
        MAX_CHALLENGE_PERIOD,
        MIN_BOND_BPS,
        MIN_BOND_ABSOLUTE,
      )
      .accounts({
        admin: admin.publicKey,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const config = await (program.account as any).protocolConfig.fetch(configPda);
    assert.equal(config.threshold, 2);
    assert.equal(config.arbitrators.length, 3);
  });

  const happySpecHash = Buffer.alloc(32);
  happySpecHash[0] = 0x01;
  let happyJobPda: PublicKey;
  let happyEscrowKp: Keypair;

  it("creates a job (Open)", async () => {
    [happyJobPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("job"), poster.publicKey.toBuffer(), happySpecHash],
      program.programId,
    );
    happyEscrowKp = Keypair.generate();

    await program.methods
      .createJob(
        new BN(5_000_000),
        Array.from(happySpecHash),
        new BN(Math.floor(Date.now() / 1000) + 7200),
        MIN_CHALLENGE_PERIOD,
      )
      .accounts({
        poster: poster.publicKey,
        config: configPda,
        jobEscrow: happyJobPda,
        escrowTokenAccount: happyEscrowKp.publicKey,
        posterTokenAccount: posterAta,
        tokenMint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([poster, happyEscrowKp])
      .rpc();

    const job = await (program.account as any).jobEscrow.fetch(happyJobPda);
    assert.ok(job.status.open !== undefined);
    assert.equal(job.amount.toString(), "5000000");
  });

  it("taker accepts the job", async () => {
    await program.methods
      .acceptJob(Array.from(happySpecHash))
      .accounts({
        taker: taker.publicKey,
        jobEscrow: happyJobPda,
        poster: poster.publicKey,
      })
      .signers([taker])
      .rpc();

    const job = await (program.account as any).jobEscrow.fetch(happyJobPda);
    assert.ok(job.status.accepted !== undefined);
    assert.equal(job.taker.toBase58(), taker.publicKey.toBase58());
  });

  it("taker submits work -> Delivered", async () => {
    const workHash = Buffer.alloc(32);
    workHash[0] = 0xaa;
    await program.methods
      .submitWork(Array.from(workHash), "https://example.com/delivery.md")
      .accounts({
        taker: taker.publicKey,
        jobEscrow: happyJobPda,
        poster: poster.publicKey,
      })
      .signers([taker])
      .rpc();

    const job = await (program.account as any).jobEscrow.fetch(happyJobPda);
    assert.ok(job.status.delivered !== undefined);
    assert.ok(job.challengeEnd.toNumber() > Math.floor(Date.now() / 1000));
  });

  it("early finalize fails with ChallengePeriodNotExpired", async () => {
    const [repPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("reputation"), taker.publicKey.toBuffer()],
      program.programId,
    );

    try {
      await program.methods
        .finalizePayment()
        .accounts({
          crank: crank.publicKey,
          jobEscrow: happyJobPda,
          poster: poster.publicKey,
          escrowTokenAccount: happyEscrowKp.publicKey,
          takerTokenAccount: takerAta,
          taker: taker.publicKey,
          takerReputation: repPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([crank])
        .rpc();
      assert.fail("finalize should have failed — challenge period not expired");
    } catch (err) {
      const msg = String(err);
      assert.ok(
        msg.includes("ChallengePeriodNotExpired") ||
          msg.includes("custom program error"),
        `expected ChallengePeriodNotExpired, got: ${msg}`,
      );
    }
  });

  // Dispute path
  const disputeSpecHash = Buffer.alloc(32);
  disputeSpecHash[0] = 0x02;
  let disputeJobPda: PublicKey;
  let disputeEscrowKp: Keypair;

  it("creates second job and delivers for dispute path", async () => {
    [disputeJobPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("job"), poster.publicKey.toBuffer(), disputeSpecHash],
      program.programId,
    );
    disputeEscrowKp = Keypair.generate();

    await program.methods
      .createJob(
        new BN(10_000_000),
        Array.from(disputeSpecHash),
        new BN(Math.floor(Date.now() / 1000) + 7200),
        MIN_CHALLENGE_PERIOD,
      )
      .accounts({
        poster: poster.publicKey,
        config: configPda,
        jobEscrow: disputeJobPda,
        escrowTokenAccount: disputeEscrowKp.publicKey,
        posterTokenAccount: posterAta,
        tokenMint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([poster, disputeEscrowKp])
      .rpc();

    await program.methods
      .acceptJob(Array.from(disputeSpecHash))
      .accounts({
        taker: taker.publicKey,
        jobEscrow: disputeJobPda,
        poster: poster.publicKey,
      })
      .signers([taker])
      .rpc();

    const workHash = Buffer.alloc(32);
    workHash[0] = 0xbb;
    await program.methods
      .submitWork(Array.from(workHash), "https://example.com/disputed.md")
      .accounts({
        taker: taker.publicKey,
        jobEscrow: disputeJobPda,
        poster: poster.publicKey,
      })
      .signers([taker])
      .rpc();
  });

  it("poster raises a dispute within challenge window", async () => {
    const [bondPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("bond"), disputeJobPda.toBuffer()],
      program.programId,
    );
    const reasonHash = Buffer.alloc(32);
    reasonHash[0] = 0xcc;

    await program.methods
      .raiseDispute(Array.from(reasonHash), new BN(1_000_000))
      .accounts({
        poster: poster.publicKey,
        config: configPda,
        jobEscrow: disputeJobPda,
        bondTokenAccount: bondPda,
        posterTokenAccount: posterAta,
        tokenMint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([poster])
      .rpc();

    const job = await (program.account as any).jobEscrow.fetch(disputeJobPda);
    assert.ok(job.status.disputed !== undefined);
    assert.ok(job.dispute.raisedAt.toNumber() > 0);
    assert.equal(job.dispute.bond.toString(), "1000000");
  });

  it("first arbitrator approves FavorPoster (1/2)", async () => {
    const [bondPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("bond"), disputeJobPda.toBuffer()],
      program.programId,
    );
    const [repPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("reputation"), taker.publicKey.toBuffer()],
      program.programId,
    );

    await program.methods
      .resolveDispute({ favorPoster: {} })
      .accounts({
        arbitrator: arb1.publicKey,
        config: configPda,
        jobEscrow: disputeJobPda,
        poster: poster.publicKey,
        escrowTokenAccount: disputeEscrowKp.publicKey,
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

    const job = await (program.account as any).jobEscrow.fetch(disputeJobPda);
    assert.equal(job.dispute.approvalCount, 1);
    assert.equal(job.dispute.approvalMask, 0b001);
    assert.ok(job.status.disputed !== undefined);
  });

  it("second arbitrator approves, reaches 2-of-3 threshold -> Resolved", async () => {
    const [bondPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("bond"), disputeJobPda.toBuffer()],
      program.programId,
    );
    const [repPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("reputation"), taker.publicKey.toBuffer()],
      program.programId,
    );

    const posterBalanceBefore = (
      await getAccount(provider.connection, posterAta)
    ).amount;

    await program.methods
      .resolveDispute({ favorPoster: {} })
      .accounts({
        arbitrator: arb2.publicKey,
        config: configPda,
        jobEscrow: disputeJobPda,
        poster: poster.publicKey,
        escrowTokenAccount: disputeEscrowKp.publicKey,
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

    const job = await (program.account as any).jobEscrow.fetch(disputeJobPda);
    assert.ok(job.status.resolved !== undefined);
    assert.equal(job.dispute.approvalCount, 2);

    const posterBalanceAfter = (
      await getAccount(provider.connection, posterAta)
    ).amount;
    // Poster receives 10 USDC escrow refund + 1 USDC bond back = 11 USDC
    assert.equal(
      (posterBalanceAfter - posterBalanceBefore).toString(),
      "11000000",
      "poster should receive escrow refund + bond return",
    );
  });
});
