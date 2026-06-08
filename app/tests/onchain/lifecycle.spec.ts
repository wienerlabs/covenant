/**
 * C-004 — settlement contract test spec (red tests first).
 *
 * This is a **real devnet** spec describing the on-chain job lifecycle that M1
 * must make pass. It is intentionally *currently failing*: the deployed program
 * rejects every instruction with `DeclaredProgramIdMismatch (4100)` until it is
 * rebuilt + redeployed + `init_config`'d (tracked in #236). Once that lands and
 * the real lifecycle is wired, these assertions go green — no edits needed.
 *
 * This file is NOT part of the unit suite (`tests/unit/*.test.ts`); it talks to
 * a live cluster and needs a funded poster, so it is run on demand:
 *
 *   HIRE_POSTER_KEYFILE=/path/to/poster.json \
 *     npx tsx --test tests/onchain/lifecycle.spec.ts
 *
 * The poster keypair must hold devnet USDC (the escrow amount) + SOL (fees).
 * When the keyfile env is unset the spec skips (so it never blocks CI).
 */

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import crypto from "node:crypto";
import {
  Keypair,
  Connection,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddress } from "@solana/spl-token";
import {
  botCreateJob,
  botAcceptJob,
  botSubmitWork,
  botFinalizePayment,
  fetchJobEscrow,
  deriveJobPda,
} from "../../lib/program-server";

const RPC = process.env.SMOKE_RPC ?? "https://api.devnet.solana.com";
const KEYFILE = process.env.HIRE_POSTER_KEYFILE ?? "";
const USDC = new PublicKey("F7RYRqCy8uWYxjxrXVhU3iUCRwa9bKBUTkGKktpyYueQ");
const AMOUNT = 5;
const SKIP = !KEYFILE || !existsSync(KEYFILE);

const conn = new Connection(RPC, "confirmed");
let poster: Keypair;
let agent: Keypair;
const specHash = crypto.createHash("sha256").update("c004-lifecycle-" + Date.now()).digest();
const workHash = crypto.createHash("sha256").update("c004-delivery").digest();

before(async () => {
  if (SKIP) return;
  poster = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(KEYFILE, "utf8"))));
  agent = Keypair.generate();
  // Fund the throwaway agent with SOL for fees.
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: poster.publicKey,
      toPubkey: agent.publicKey,
      lamports: Math.floor(0.03 * LAMPORTS_PER_SOL),
    }),
  );
  await sendAndConfirmTransaction(conn, tx, [poster]);
});

const opts = { skip: SKIP ? "set HIRE_POSTER_KEYFILE (funded devnet poster) to run" : false };

test("create_job locks USDC in the escrow PDA", opts, async () => {
  const created = await botCreateJob({
    botKeypair: poster,
    amount: AMOUNT,
    specHash,
    deadline: Math.floor(Date.now() / 1000) + 24 * 3600,
    challengePeriod: 60,
  });
  const escrowBal = await conn.getTokenAccountBalance(created.escrowTokenAccount);
  assert.equal(Number(escrowBal.value.uiAmount), AMOUNT, "escrow ATA holds the locked USDC");
  const job = await fetchJobEscrow(deriveJobPda(poster.publicKey, specHash)[0]);
  assert.ok(job, "JobEscrow account exists on-chain");
});

test("accept_job binds the taker on-chain", opts, async () => {
  await botAcceptJob({ takerBotKeypair: agent, poster: poster.publicKey, specHash });
  const job = await fetchJobEscrow(deriveJobPda(poster.publicKey, specHash)[0]);
  assert.equal(job?.taker, agent.publicKey.toBase58(), "on-chain taker == agent");
  assert.equal(job?.status, "Accepted");
});

test("submit_work records the work hash + moves to Delivered", opts, async () => {
  await botSubmitWork({
    takerBotKeypair: agent,
    poster: poster.publicKey,
    specHash,
    workHash,
    deliveryUri: "https://example.invalid/work.json",
  });
  const job = await fetchJobEscrow(deriveJobPda(poster.publicKey, specHash)[0]);
  assert.equal(job?.status, "Delivered");
});

test("finalize_payment moves USDC from escrow to the taker", opts, async () => {
  const takerAta = await getAssociatedTokenAddress(USDC, agent.publicKey);
  const before = await getAccount(conn, takerAta).then((a) => Number(a.amount)).catch(() => 0);
  const [jobPda] = deriveJobPda(poster.publicKey, specHash);
  const escrowAta = await getAssociatedTokenAddress(USDC, jobPda, true);
  await botFinalizePayment({
    crankKeypair: poster,
    poster: poster.publicKey,
    taker: agent.publicKey,
    specHash,
    escrowTokenAccount: escrowAta,
  });
  const after = await getAccount(conn, takerAta).then((a) => Number(a.amount));
  assert.ok(after > before, "taker USDC balance increased after finalize");
  const job = await fetchJobEscrow(deriveJobPda(poster.publicKey, specHash)[0]);
  assert.equal(job?.status, "Finalized");
});
