/**
 * C-019 devnet smoke — run a REAL on-chain agent hire end to end.
 *
 * Loads a funded poster keypair (SOL + USDC), creates a throwaway agent
 * keypair, funds it with a little SOL for fees, then runs the real
 * create_job -> accept_job -> submit_work lifecycle via the same
 * `hireAgentOnchain` orchestration the /api/agents/hire route uses. Prints the
 * Explorer links proving real transactions (not marker memos).
 *
 *   HIRE_POSTER_KEYFILE=/tmp/poster.json npx tsx scripts/hire-smoke.ts
 */
import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import {
  Keypair,
  Connection,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { botCreateJob, botAcceptJob, botSubmitWork } from "../lib/program-server";
import { hireAgentOnchain } from "../lib/hire-onchain";

const RPC = process.env.SMOKE_RPC ?? "https://api.devnet.solana.com";
const KEYFILE = process.env.HIRE_POSTER_KEYFILE ?? "/tmp/poster.json";
const AMOUNT = Number(process.env.SMOKE_AMOUNT ?? 10);

const exp = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

async function main(): Promise<void> {
  const poster = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(KEYFILE, "utf8"))),
  );
  const agent = Keypair.generate();
  const conn = new Connection(RPC, "confirmed");

  console.log("poster:", poster.publicKey.toBase58());
  console.log("agent :", agent.publicKey.toBase58());

  // Fund the throwaway agent with a little SOL for fees (from the poster).
  const fund = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: poster.publicKey,
      toPubkey: agent.publicKey,
      lamports: Math.floor(0.05 * LAMPORTS_PER_SOL),
    }),
  );
  const fundSig = await sendAndConfirmTransaction(conn, fund, [poster]);
  console.log("funded agent SOL:", exp(fundSig));

  const spec = { title: "Smoke hire", agent: "smoke", amount: AMOUNT, ts: Date.now() };
  const specHash = crypto.createHash("sha256").update(JSON.stringify(spec)).digest();
  const workHash = crypto.createHash("sha256").update("delivered work " + Date.now()).digest();
  const deadlineUnix = Math.floor(Date.now() / 1000) + 24 * 3600;

  const res = await hireAgentOnchain({
    posterKeypair: poster,
    agentKeypair: agent,
    amount: AMOUNT,
    specHash,
    deadlineUnix,
    challengePeriodSec: 60,
    workHash,
    deliveryUri: "https://example.invalid/work.json",
    deps: { botCreateJob, botAcceptJob, botSubmitWork },
  });

  console.log("\nREAL ON-CHAIN HIRE:");
  console.log("  jobPda :", res.jobPda);
  console.log("  escrow :", res.escrowTokenAccount);
  console.log("  create :", exp(res.createSig));
  console.log("  accept :", exp(res.acceptSig));
  console.log("  deliver:", exp(res.submitSig));
}

main().catch((e) => {
  console.error("smoke failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
