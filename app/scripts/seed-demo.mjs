/**
 * Demo seed for a realistic-looking settlement page.
 *
 * Creates Jobs across every lifecycle state so /settlement renders a
 * live-feeling dashboard: Open jobs, Accepted jobs, Delivered jobs with
 * varied challenge-window countdowns, recent Finalized settlements with
 * Solscan-able tx hashes, plus a couple of Disputed/Resolved.
 *
 * Run:
 *   cd app
 *   DATABASE_URL="postgresql://..." node scripts/seed-demo.mjs
 *
 * Safe to re-run: it only inserts, it does not wipe. Pass --wipe to
 * delete previously seeded demo rows first (they carry a DEMO marker in
 * specJson.seed).
 */

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const prisma = new PrismaClient();

const WIPE = process.argv.includes("--wipe");

// ---- realistic-looking base58 generators ---------------------------------

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58(len) {
  let s = "";
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) s += B58[bytes[i] % B58.length];
  return s;
}
const wallet = () => base58(44);
const pda = () => base58(44);
const txSig = () => base58(88);
const specHash = () => crypto.randomBytes(32).toString("hex");

// A stable cast of demo wallets so reputations look consistent.
const POSTERS = Array.from({ length: 6 }, () => wallet());
const TAKERS = Array.from({ length: 6 }, () => wallet());
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---- realistic job templates per category --------------------------------

const TEMPLATES = [
  { category: "solana_agent", title: "Wallet risk report for a Solana address", description: "Pull on-chain history, classify counterparty risk, return a LOW/MEDIUM/HIGH verdict with cited signatures.", minWords: 400 },
  { category: "solana_agent", title: "Token holder concentration check", description: "Top 10 holders of a token mint, flag any single wallet above 5% of supply.", minWords: 250 },
  { category: "text_writing", title: "Write a 600-word launch blog post", description: "Announce a Solana-native settlement layer for AI agents. Confident, technical, no fluff.", minWords: 600 },
  { category: "text_writing", title: "Twitter thread on agent payments", description: "8-tweet thread explaining why agents need escrow, not just API payments.", minWords: 280 },
  { category: "code_review", title: "Review an Anchor escrow instruction", description: "Audit a create_job instruction for missing checks and reentrancy-style bugs.", minWords: 350 },
  { category: "translation", title: "Translate docs EN to TR", description: "Translate the protocol overview from English to Turkish, keep technical terms.", minWords: 500 },
  { category: "data_labeling", title: "Label 200 wallet transactions", description: "Classify each transaction as swap, transfer, mint, or stake.", minWords: 200 },
  { category: "bug_bounty", title: "Find an SSRF in the agent registration flow", description: "Probe the public agent registration endpoint for SSRF and report a PoC.", minWords: 300 },
  { category: "design", title: "Logo for a Solana agent marketplace", description: "Minimalist geometric wordmark plus symbol, infrastructure-grade.", minWords: 0 },
];

const now = Date.now();
const minutes = (n) => n * 60 * 1000;
const hours = (n) => n * 60 * 60 * 1000;
const iso = (ms) => new Date(ms).toISOString();

function amount() {
  // skew toward small micro-jobs, the thesis of the product
  const pool = [1, 2, 3, 5, 5, 5, 8, 10, 12, 18, 25, 40];
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Build one job row in a given state. challengeOffsetMs (for Delivered)
 * sets how far in the future the challenge window ends.
 */
function makeJob(state, opts = {}) {
  const t = pick(TEMPLATES);
  const createdAt = now - (opts.ageMs ?? hours(2 + Math.random() * 40));
  const amt = amount();
  const poster = pick(POSTERS);
  const taker = pick(TAKERS);
  const base = {
    pda: pda(),
    escrowAta: pda(),
    posterWallet: poster,
    amount: amt,
    paymentToken: "USDC",
    specHash: specHash(),
    specJson: { title: t.title, description: t.description, seed: "DEMO" },
    minWords: t.minWords,
    category: t.category,
    language: "en",
    challengePeriod: 86400,
    deadline: new Date(now + hours(24 + Math.random() * 48)),
    createdAt: new Date(createdAt),
    updatedAt: new Date(createdAt),
    txHash: txSig(),
  };

  if (state === "Open") {
    return { ...base, status: "Open", takerWallet: null };
  }
  if (state === "Accepted") {
    return { ...base, status: "Accepted", takerWallet: taker };
  }
  if (state === "Delivered") {
    const deliveredAt = now - (opts.deliveredAgoMs ?? minutes(30 + Math.random() * 200));
    const challengeEndAt = now + (opts.challengeInMs ?? hours(1 + Math.random() * 23));
    return {
      ...base,
      status: "Delivered",
      takerWallet: taker,
      deliveredAt: new Date(deliveredAt),
      challengeEndAt: new Date(challengeEndAt),
      updatedAt: new Date(deliveredAt),
    };
  }
  if (state === "Finalized") {
    const settledAt = now - (opts.settledAgoMs ?? minutes(10 + Math.random() * 600));
    const deliveredAt = settledAt - hours(24);
    return {
      ...base,
      status: "Finalized",
      takerWallet: taker,
      deliveredAt: new Date(deliveredAt),
      challengeEndAt: new Date(settledAt),
      updatedAt: new Date(settledAt),
    };
  }
  if (state === "Disputed") {
    const deliveredAt = now - minutes(60 + Math.random() * 300);
    return {
      ...base,
      status: "Disputed",
      takerWallet: taker,
      deliveredAt: new Date(deliveredAt),
      challengeEndAt: new Date(now + hours(2 + Math.random() * 10)),
      updatedAt: new Date(deliveredAt),
    };
  }
  if (state === "Resolved") {
    const settledAt = now - minutes(20 + Math.random() * 400);
    return {
      ...base,
      status: "Resolved",
      takerWallet: taker,
      deliveredAt: new Date(settledAt - hours(20)),
      challengeEndAt: new Date(settledAt),
      updatedAt: new Date(settledAt),
    };
  }
  throw new Error(`unknown state ${state}`);
}

async function main() {
  if (WIPE) {
    const del = await prisma.job.deleteMany({
      where: { specJson: { path: ["seed"], equals: "DEMO" } },
    });
    console.log(`wiped ${del.count} prior demo jobs`);
  }

  const plan = [
    ...Array.from({ length: 9 }, () => makeJob("Open")),
    ...Array.from({ length: 4 }, () => makeJob("Accepted")),
    // Delivered jobs with countdowns spread across the next 24h so the
    // "in challenge window now" feed shows a realistic ladder of timers.
    makeJob("Delivered", { challengeInMs: minutes(42) }),
    makeJob("Delivered", { challengeInMs: hours(2) + minutes(15) }),
    makeJob("Delivered", { challengeInMs: hours(5) }),
    makeJob("Delivered", { challengeInMs: hours(9) + minutes(30) }),
    makeJob("Delivered", { challengeInMs: hours(14) }),
    makeJob("Delivered", { challengeInMs: hours(21) }),
    // Recent settlements within the last few hours (fill the ticker +
    // recent panel with fresh rows).
    ...Array.from({ length: 8 }, (_, i) =>
      makeJob("Finalized", { settledAgoMs: minutes(8 + i * 35) }),
    ),
    // Historical settlements spread across the last 14 days so the volume
    // chart shows a real time series, not a single bar.
    ...Array.from({ length: 60 }, () =>
      makeJob("Finalized", {
        settledAgoMs: hours(6 + Math.random() * 13 * 24),
      }),
    ),
    makeJob("Resolved", { settledAgoMs: minutes(55) }),
    makeJob("Resolved", { settledAgoMs: minutes(180) }),
    makeJob("Disputed"),
    makeJob("Disputed"),
  ];

  let created = 0;
  for (const data of plan) {
    await prisma.job.create({ data });
    created++;
  }

  // Seed reputations so covenant_get_reputation / the UI look alive.
  for (const w of TAKERS) {
    const jobsCompleted = 3 + Math.floor(Math.random() * 40);
    await prisma.reputation.upsert({
      where: { walletAddress: w },
      create: {
        walletAddress: w,
        jobsCompleted,
        totalEarned: jobsCompleted * (3 + Math.random() * 12),
        firstJobAt: new Date(now - hours(200 + Math.random() * 1000)),
      },
      update: {},
    });
  }

  const counts = await prisma.job.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  console.log(`seeded ${created} demo jobs`);
  console.table(
    counts.map((c) => ({ status: c.status, count: c._count._all })),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
