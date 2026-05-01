/**
 * Covenant SDK example — runs against the live Devnet deployment.
 *
 * Demonstrates the standard agent-as-a-consumer flow using only
 * the typed SDK (no Anchor / Solana web3 required for the read
 * paths). Useful as:
 *   - A copy-paste starting point for external integrations
 *   - A smoke test for the deployed API surface
 *   - Documentation by example for what the SDK offers
 *
 * Run from the app/ directory:
 *   npx tsx scripts/sdk-example.ts
 *   BASE=https://covenant.run npx tsx scripts/sdk-example.ts
 *
 * Environment variables (all optional):
 *   BASE      Override the Covenant base URL.
 *   POSTER    Override the poster wallet pubkey for lookup.
 *   SPECHASH  Override the spec hash for lookup.
 */

import { CovenantClient, CovenantError } from "../lib/sdk";

const BASE = process.env.BASE ?? "https://covenant.run";
const POSTER =
  process.env.POSTER ?? "7GpXEwNrf8BVFBGMYjuYHoSmN1FvGFQD1MTtgJk2u7fG";
const SPECHASH =
  process.env.SPECHASH ??
  "0".repeat(64);

async function main() {
  const cv = new CovenantClient({ baseUrl: BASE, timeoutMs: 30_000 });
  const t0 = Date.now();

  // 1. Service health
  const health = await cv.health();
  console.log("\n[1] /api/health");
  console.log(`    ok=${health.ok}  cluster=${health.cluster}  commit=${health.commit ?? "unknown"}`);
  console.log(`    db=${health.checks.database?.ok ? "✓" : "✗"} ${health.checks.database?.detail ?? ""}`);

  // 2. Build identification
  const ver = await cv.version();
  console.log("\n[2] /api/version");
  console.log(`    commit=${ver.commit_short ?? "unknown"}  branch=${ver.branch ?? "?"}  region=${ver.region ?? "?"}`);

  // 3. Open jobs
  const jobs = await cv.listJobs({ status: "Open", limit: 5 });
  console.log("\n[3] /api/jobs?status=Open");
  console.log(`    ${jobs.total} open jobs total, showing first ${jobs.jobs.length}`);
  for (const j of jobs.jobs.slice(0, 3)) {
    console.log(`    · ${j.id.slice(0, 10)}  amount=${j.amount} USDC  cat=${j.category}`);
  }

  // 4. ELO leaderboard
  const elo = await cv.eloLeaderboard();
  console.log("\n[4] /api/elo/leaderboard");
  console.log(`    ${elo.length} agents`);
  for (const r of elo.slice(0, 3)) {
    console.log(`    · ${r.agentName.padEnd(20)} ELO=${r.elo}  (${r.wins}W/${r.losses}L)`);
  }

  // 5. Credit market snapshot
  const credit = await cv.listClaims();
  console.log("\n[5] /api/claims");
  console.log(
    `    listed=${credit.totals.listed} active TVL=${credit.totals.activeTvl} USDC ` +
      `bought=${credit.totals.boughtCount} settled=${credit.totals.settledCount}`,
  );

  // 6. Idempotency lookup
  try {
    const lookup = await cv.lookupJob({ posterWallet: POSTER, specHash: SPECHASH });
    console.log("\n[6] /api/jobs/lookup");
    console.log(`    exists=${lookup.exists}${lookup.job ? `  status=${lookup.job.status}` : ""}`);
  } catch (err) {
    if (err instanceof CovenantError) {
      console.log(`\n[6] /api/jobs/lookup  → ${err.code}  ${err.message}`);
    } else {
      throw err;
    }
  }

  console.log(`\nTotal ${Date.now() - t0}ms`);
}

main().catch((err) => {
  if (err instanceof CovenantError) {
    console.error(`\n✗ ${err.code} (${err.status}): ${err.message}`);
    if (err.details) console.error("  details:", err.details);
    if (err.request_id) console.error("  request_id:", err.request_id);
  } else {
    console.error("\n✗ unexpected:", err);
  }
  process.exit(1);
});
