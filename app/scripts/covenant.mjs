#!/usr/bin/env node
/**
 * Covenant CLI — read-mostly inspection tool.
 *
 * Wraps the public HTTP API. Useful for:
 *   - Quick "is the marketplace alive?" checks during a demo
 *   - Operators tailing job state without opening the dashboard
 *   - CI smoke jobs that want structured output
 *   - Onboarding docs ("just run `covenant health`")
 *
 * Usage:
 *
 *   covenant health
 *   covenant version
 *   covenant jobs [--status Open] [--limit 10] [--json]
 *   covenant job <id>
 *   covenant lookup <posterWallet> <specHash>
 *   covenant elo [--top 10]
 *   covenant claims
 *   covenant openapi [--save spec.json]
 *   covenant ops          # admin/db-stats, needs $ADMIN_SECRET
 *   covenant errors       # admin/error-buffer, needs $ADMIN_SECRET
 *   covenant cache        # admin/cache-stats, needs $ADMIN_SECRET
 *   covenant smoke        # quick 6-endpoint health roll-up
 *
 * Environment:
 *   BASE          override the API base URL (default https://covenant.run)
 *   ADMIN_SECRET  for the admin commands (ops, errors, cache)
 *
 * Exit codes:
 *   0  success
 *   1  command failed (network error, 4xx, etc.)
 *   2  bad usage (unknown command, missing args)
 */

import { writeFileSync } from "node:fs";

const BASE = (process.env.BASE || "https://covenant.run").replace(/\/$/, "");
const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.CRON_SECRET;

const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const GRN = "\x1b[32m";
const RED = "\x1b[31m";
const YLW = "\x1b[33m";
const CYN = "\x1b[36m";
const RST = "\x1b[0m";

const args = process.argv.slice(2);
const cmd = args[0];

if (!cmd) {
  printHelp();
  process.exit(2);
}

const flags = {};
const positional = [];
for (let i = 1; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith("--")) {
    const key = a.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  } else {
    positional.push(a);
  }
}

const JSON_OUT = !!flags.json;

try {
  switch (cmd) {
    case "health":
      await cmdHealth();
      break;
    case "version":
      await cmdVersion();
      break;
    case "jobs":
      await cmdJobs();
      break;
    case "job":
      await cmdJob();
      break;
    case "lookup":
      await cmdLookup();
      break;
    case "elo":
      await cmdElo();
      break;
    case "claims":
      await cmdClaims();
      break;
    case "openapi":
      await cmdOpenapi();
      break;
    case "ops":
      await cmdOps();
      break;
    case "errors":
      await cmdErrors();
      break;
    case "cache":
      await cmdCache();
      break;
    case "smoke":
      await cmdSmoke();
      break;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    default:
      console.error(`${RED}unknown command:${RST} ${cmd}`);
      printHelp();
      process.exit(2);
  }
} catch (err) {
  if (JSON_OUT) {
    console.log(JSON.stringify({ ok: false, error: err.message }));
  } else {
    console.error(`${RED}✗${RST} ${err.message}`);
  }
  process.exit(1);
}

// ---------- HTTP ----------

async function api(path, opts = {}) {
  const url = BASE + path;
  const headers = { Accept: "application/json", ...(opts.headers ?? {}) };
  if (opts.admin) {
    if (!ADMIN_SECRET) throw new Error("ADMIN_SECRET not set");
    headers.Authorization = `Bearer ${ADMIN_SECRET}`;
  }
  const res = await fetch(url, { method: opts.method ?? "GET", headers, body: opts.body });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    const msg =
      (parsed?.error?.message ?? parsed?.error ?? `HTTP ${res.status}`) +
      (res.headers.get("x-request-id") ? ` (req=${res.headers.get("x-request-id")})` : "");
    throw new Error(msg);
  }
  // Unwrap envelope { ok: true, data: T }
  if (parsed && typeof parsed === "object" && "ok" in parsed && "data" in parsed && parsed.ok) {
    return parsed.data;
  }
  return parsed;
}

// ---------- Commands ----------

async function cmdHealth() {
  const h = await api("/api/health");
  if (JSON_OUT) return console.log(JSON.stringify(h, null, 2));
  const status = h.ok ? `${GRN}ok${RST}` : `${RED}degraded${RST}`;
  console.log(`${BOLD}health:${RST} ${status}  ${DIM}cluster=${h.cluster} commit=${h.commit ?? "?"}${RST}`);
  for (const [k, v] of Object.entries(h.checks)) {
    const mark = v.ok ? `${GRN}✓${RST}` : `${RED}✗${RST}`;
    console.log(`  ${mark} ${k.padEnd(10)}  ${DIM}${v.detail ?? ""}${RST}`);
  }
}

async function cmdVersion() {
  const v = await api("/api/version");
  if (JSON_OUT) return console.log(JSON.stringify(v, null, 2));
  console.log(`${BOLD}covenant${RST}`);
  console.log(`  cluster:    ${v.cluster}`);
  console.log(`  commit:     ${v.commit_short ?? "?"}  (branch ${v.branch ?? "?"})`);
  console.log(`  region:     ${v.region ?? "?"}`);
  console.log(`  built_at:   ${v.built_at}`);
}

async function cmdJobs() {
  const params = new URLSearchParams();
  if (flags.status) params.set("status", flags.status);
  if (flags.category) params.set("category", flags.category);
  if (flags.wallet) params.set("poster", flags.wallet);
  params.set("limit", String(flags.limit ?? 10));
  const r = await api(`/api/jobs?${params.toString()}`);
  if (JSON_OUT) return console.log(JSON.stringify(r, null, 2));
  const jobs = r.jobs ?? [];
  console.log(`${BOLD}jobs${RST}  ${DIM}showing ${jobs.length} of ${r.total}${RST}`);
  if (r.dbHealthy === false) {
    console.log(`  ${YLW}!${RST}  db unhealthy: ${r.error ?? "unknown"}`);
    return;
  }
  for (const j of jobs) {
    const tag = colorStatus(j.status);
    console.log(
      `  ${CYN}${j.id.slice(0, 10)}${RST}  ${tag.padEnd(20)}  ${String(j.amount).padStart(8)} USDC  ${DIM}${j.category ?? ""}  ${j.posterWallet?.slice(0, 8) ?? ""}…${RST}`,
    );
  }
}

async function cmdJob() {
  const id = positional[0];
  if (!id) {
    console.error(`${RED}usage:${RST} covenant job <id>`);
    process.exit(2);
  }
  const j = await api(`/api/jobs/${encodeURIComponent(id)}`);
  if (JSON_OUT) return console.log(JSON.stringify(j, null, 2));
  console.log(`${BOLD}job ${j.id}${RST}`);
  console.log(`  status:       ${colorStatus(j.status)}`);
  console.log(`  amount:       ${j.amount} USDC`);
  console.log(`  category:     ${j.category}`);
  console.log(`  poster:       ${j.posterWallet}`);
  console.log(`  taker:        ${j.takerWallet ?? "(none)"}`);
  console.log(`  spec_hash:    ${j.specHash}`);
  console.log(`  pda:          ${j.pda ?? "(off-chain only)"}`);
  console.log(`  tx:           ${j.txHash ?? "-"}`);
  console.log(`  deadline:     ${j.deadline}`);
}

async function cmdLookup() {
  const [poster, specHash] = positional;
  if (!poster || !specHash) {
    console.error(`${RED}usage:${RST} covenant lookup <posterWallet> <specHash>`);
    process.exit(2);
  }
  const r = await api("/api/jobs/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ posterWallet: poster, specHash }),
  });
  if (JSON_OUT) return console.log(JSON.stringify(r, null, 2));
  if (r.exists) {
    console.log(`${GRN}exists${RST}  job=${r.job?.id ?? "?"}  status=${r.job?.status ?? "?"}`);
  } else {
    console.log(`${DIM}does not exist${RST}`);
  }
}

async function cmdElo() {
  const top = Number(flags.top ?? 10);
  const elo = await api("/api/elo/leaderboard");
  if (JSON_OUT) return console.log(JSON.stringify(elo.slice(0, top), null, 2));
  console.log(`${BOLD}elo leaderboard${RST}  ${DIM}top ${top}${RST}`);
  console.log(`  ${"#".padStart(2)}  ${"agent".padEnd(28)}  elo   w/l       category`);
  let i = 1;
  for (const r of elo.slice(0, top)) {
    const tag = r.isCustom ? `${CYN}community${RST}` : r.isDefault ? `${YLW}default${RST}` : "";
    const cat = r.category ?? "-";
    console.log(
      `  ${String(i).padStart(2)}  ${r.agentName.padEnd(28)}  ${String(r.elo).padStart(4)}  ${`${r.wins}/${r.losses}`.padStart(7)}  ${cat.padEnd(12)} ${tag}`,
    );
    i++;
  }
}

async function cmdClaims() {
  const r = await api("/api/claims");
  if (JSON_OUT) return console.log(JSON.stringify(r, null, 2));
  if (r.dbHealthy === false) {
    console.log(`${YLW}!${RST}  ${r.error ?? "db unhealthy"}`);
    return;
  }
  console.log(`${BOLD}covenant credit market${RST}`);
  console.log(`  listed:      ${r.totals?.listed ?? 0}`);
  console.log(`  active TVL:  ${r.totals?.activeTvl ?? 0} USDC`);
  console.log(`  bought:      ${r.totals?.boughtCount ?? 0}`);
  console.log(`  settled:     ${r.totals?.settledCount ?? 0}`);
  const listings = r.listings ?? [];
  if (listings.length > 0) {
    console.log("");
    for (const l of listings.slice(0, 10)) {
      const yld = (((l.faceValue - l.price) / l.faceValue) * 100).toFixed(2);
      console.log(
        `  ${CYN}${l.id.slice(0, 10)}${RST}  ${String(l.price).padStart(6)}/${String(l.faceValue).padEnd(6)} USDC  yield=${yld}%  status=${l.status}`,
      );
    }
  }
}

async function cmdOpenapi() {
  const spec = await api("/api/openapi");
  if (flags.save) {
    const path = typeof flags.save === "string" ? flags.save : "openapi.json";
    writeFileSync(path, JSON.stringify(spec, null, 2));
    console.log(`${GRN}saved${RST} ${path}  ${DIM}(${Object.keys(spec.paths ?? {}).length} paths)${RST}`);
    return;
  }
  if (JSON_OUT) return console.log(JSON.stringify(spec, null, 2));
  console.log(`${BOLD}${spec.info?.title} v${spec.info?.version}${RST}`);
  console.log(`  ${spec.info?.description ?? ""}`);
  console.log(`  servers: ${spec.servers?.map((s) => s.url).join(", ") ?? "?"}`);
  console.log(`  paths:`);
  for (const [p, ops] of Object.entries(spec.paths ?? {})) {
    for (const [m, op] of Object.entries(ops)) {
      console.log(`    ${m.toUpperCase().padEnd(6)} ${p.padEnd(36)} ${DIM}${op.summary ?? ""}${RST}`);
    }
  }
}

async function cmdOps() {
  const r = await api("/api/admin/db-stats", { admin: true });
  if (JSON_OUT) return console.log(JSON.stringify(r, null, 2));
  console.log(`${BOLD}db snapshot${RST}  ${DIM}${r.collected_at} (${r.duration_ms}ms)${RST}`);
  console.log(`  cluster=${r.cluster}  pg=${r.postgres_version?.split(" ")[0] ?? "?"}`);
  console.log("");
  console.log(`${BOLD}jobs${RST}`);
  console.log(`  open=${r.jobs.open_now}  done24h=${r.jobs.completed_in_last_24h}  total=${r.jobs.total_amount_usdc} USDC  avg=${r.jobs.avg_amount_usdc}`);
  for (const [s, n] of Object.entries(r.jobs.by_status)) console.log(`    ${s.padEnd(12)} ${n}`);
  console.log("");
  console.log(`${BOLD}claims${RST}  TVL=${r.claims.active_tvl_usdc} USDC`);
  for (const [s, n] of Object.entries(r.claims.by_status)) console.log(`    ${s.padEnd(12)} ${n}`);
  console.log("");
  console.log(`${BOLD}tables${RST}`);
  for (const [t, n] of Object.entries(r.tables)) {
    const color = n < 0 ? RED : RST;
    console.log(`  ${t.padEnd(20)} ${color}${n}${RST}`);
  }
  if (r.errors.length > 0) {
    console.log(`\n${RED}errors:${RST}`);
    for (const e of r.errors) console.log(`  - ${e}`);
  }
}

async function cmdErrors() {
  const r = await api("/api/admin/error-buffer?limit=20", { admin: true });
  if (JSON_OUT) return console.log(JSON.stringify(r, null, 2));
  console.log(`${BOLD}error buffer${RST}  ${r.stats?.count ?? 0}/${r.stats?.capacity ?? 0}`);
  for (const e of r.entries ?? []) {
    console.log(`${RED}[${e.recorded_at?.replace("T", " ").slice(0, 19)}]${RST} ${e.msg}`);
    if (e.route) console.log(`  ${DIM}route=${e.route} req=${e.request_id ?? "?"}${RST}`);
    if (e.err_message) console.log(`  ${DIM}${e.err_message.slice(0, 200)}${RST}`);
  }
  if ((r.entries ?? []).length === 0) {
    console.log(`  ${DIM}(empty — no errors recorded since this instance started)${RST}`);
  }
}

async function cmdCache() {
  const r = await api("/api/admin/cache-stats", { admin: true });
  if (JSON_OUT) return console.log(JSON.stringify(r, null, 2));
  const rate = (r.hit_rate * 100).toFixed(1);
  const rateColor = r.hit_rate > 0.7 ? GRN : r.hit_rate > 0.4 ? YLW : RED;
  console.log(`${BOLD}cache${RST}`);
  console.log(`  hit rate:    ${rateColor}${rate}%${RST}`);
  console.log(`  hits:        ${r.hits}`);
  console.log(`  stale hits:  ${r.staleHits}`);
  console.log(`  misses:      ${r.misses}`);
  console.log(`  evictions:   ${r.evictions}`);
  console.log(`  errors:      ${r.errors}`);
  console.log(`  entries:     ${r.size}/${r.max}`);
  if (r.instance_uptime_ms) {
    console.log(`  ${DIM}instance uptime ${(r.instance_uptime_ms / 1000).toFixed(0)}s${RST}`);
  }
}

async function cmdSmoke() {
  const checks = [
    ["/", "GET"],
    ["/api/health", "GET"],
    ["/api/version", "GET"],
    ["/api/jobs?limit=1", "GET"],
    ["/api/elo/leaderboard", "GET"],
    ["/api/claims", "GET"],
  ];
  let ok = 0;
  let fail = 0;
  console.log(`${BOLD}smoke (${BASE})${RST}`);
  for (const [p, m] of checks) {
    const t0 = Date.now();
    try {
      const res = await fetch(BASE + p, { method: m });
      const dur = Date.now() - t0;
      if (res.ok) {
        console.log(`  ${GRN}✓${RST} ${m} ${p.padEnd(34)} ${DIM}${res.status}  ${dur}ms${RST}`);
        ok++;
      } else {
        console.log(`  ${RED}✗${RST} ${m} ${p.padEnd(34)} ${DIM}${res.status}  ${dur}ms${RST}`);
        fail++;
      }
    } catch (err) {
      console.log(`  ${RED}✗${RST} ${m} ${p.padEnd(34)} ${DIM}${err.message}${RST}`);
      fail++;
    }
  }
  console.log("");
  console.log(`${BOLD}${ok}/${ok + fail} pass${RST}`);
  if (fail > 0) process.exit(1);
}

// ---------- Helpers ----------

function colorStatus(s) {
  if (!s) return "";
  if (s === "Open") return `${YLW}${s}${RST}`;
  if (s === "Accepted" || s === "Delivered") return `${CYN}${s}${RST}`;
  if (s === "Finalized" || s === "Completed") return `${GRN}${s}${RST}`;
  if (s === "Disputed") return `${RED}${s}${RST}`;
  return s;
}

function printHelp() {
  console.log(`${BOLD}covenant${RST} — devnet API CLI

usage:  covenant <command> [args] [--flags]

commands:
  health                   service + dependency status
  version                  deployed commit + region
  jobs [--status X]        list jobs (--limit, --category, --wallet)
  job <id>                 show one job
  lookup <wallet> <hash>   idempotency check
  elo [--top 10]           ELO leaderboard
  claims                   covenant credit market
  openapi [--save x.json]  inspect / save the OpenAPI spec

  admin (need ADMIN_SECRET env):
    ops                    db snapshot
    errors                 error buffer
    cache                  cache stats

  smoke                    quick 6-endpoint roll-up

flags:
  --json                   machine-readable output
  --status, --category, --wallet, --limit, --top  filters

env:
  BASE          override API base (default https://covenant.run)
  ADMIN_SECRET  for admin commands
`);
}
