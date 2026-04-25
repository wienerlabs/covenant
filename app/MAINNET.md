# Covenant — Mainnet Deployment Guide

This doc captures everything you need to flip the Covenant frontend +
API from Devnet to Mainnet-Beta. The codebase is **cluster-aware** —
every cluster-specific value (RPC URL, USDC mint, Anchor program ID)
is resolved at runtime through `lib/network.ts`, so switching is a
configuration change, not a code change.

---

## TL;DR — minimum env to go live on mainnet

```bash
# 1. Cluster switch
NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta

# 2. The deployed Covenant Anchor program (replace with real ID after deploy)
NEXT_PUBLIC_PROGRAM_ID_MAINNET=<32-44-char base58 program id>

# 3. RPC — Helius / Triton / QuickNode strongly preferred over public RPC
HELIUS_API_KEY=<your-helius-key>
# or, full URL:
NEXT_PUBLIC_RPC_URL_MAINNET=https://mainnet.helius-rpc.com/?api-key=...

# 4. Database (Postgres) — keep these unchanged but verify mainnet DB exists
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...   # for migrations on pooled connections

# 5. Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# 6. Bot keypairs — only if you want the arena/battle bots running on mainnet
#    (each must be funded with real SOL + USDC). Otherwise leave unset and
#    the arena uses canned outputs via lib/anthropic-safe withCreditFallback.
AGENT_ALPHA_KEYPAIR=[ ... 64-byte secret-key array ... ]
AGENT_OMEGA_KEYPAIR=[ ... ]
DEPLOYER_KEYPAIR=[ ... ]

# 7. Internal cron secret — for /api/* routes that bots invoke
CRON_SECRET=<random-secret>
```

USDC mint defaults to **Circle USDC**
(`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`) on mainnet — no need
to override unless you're running on a fork.

---

## What the cluster switch actually does

`lib/network.ts` reads `NEXT_PUBLIC_SOLANA_CLUSTER` and exports:

| Constant | Devnet | Mainnet |
|----------|--------|---------|
| `RPC_URL` | `api.devnet.solana.com` (or Helius) | `api.mainnet-beta.solana.com` (or Helius) |
| `PROGRAM_ID` | `5hstj5gr...` (the deployed devnet program) | `NEXT_PUBLIC_PROGRAM_ID_MAINNET` |
| `USDC_MINT` | Test USDC | Circle USDC `EPjFWdd5...` |
| `FAUCET_ENABLED` | `true` | `false` |
| `IS_MAINNET` | `false` | `true` |
| `explorerTxUrl(sig)` | adds `?cluster=devnet` | bare mainnet URL |

Re-exports flow through `lib/constants.ts`, so any module already
importing `PROGRAM_ID` / `USDC_MINT` / `RPC_URL` from `lib/constants`
picks up the new values automatically.

---

## Pre-deploy checklist

```
☐ Anchor program deployed to mainnet-beta + program ID copied
☐ NEXT_PUBLIC_PROGRAM_ID_MAINNET set in Vercel env vars
☐ NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta in Vercel env vars
☐ Helius / RPC URL configured (avoid public RPC under load)
☐ DATABASE_URL points to production Postgres (not dev branch)
☐ Bot keypairs (alpha/omega/deployer) funded with mainnet SOL + USDC
   if arena/battle bots are enabled — otherwise arena uses fallback
☐ Faucet automatically disabled (verified via /api/faucet returning 403)
☐ Cluster badge in NavBar shows "Mainnet" (green)
☐ Solana Explorer links resolve without ?cluster= query
☐ Smoke test: connect wallet → /poster → create a low-amount job
   ($1 USDC) → verify on Explorer that escrow PDA holds the funds
```

---

## Common failure modes

### 1. "Wallet rejected unknown signer" on create_job
The Anchor program requires the escrow token account keypair as a
**co-signer**. Some wallet adapters (notably the Solana Connector
WalletConnect path) reject any tx with an unknown signer. The
codebase auto-falls-back to **demo mode** in this case (record-only
DB row + memo TX).

To fully unblock real on-chain settlement on mainnet, the Anchor
program needs to migrate to **PDA-derived ATAs** for the escrow —
remove the `Keypair` co-signer, derive the token account as the
ATA of the JobEscrow PDA. This is a Rust-side change that requires
a program upgrade. Until that lands, mainnet deploys can run with
demo-mode fallback active (functionally a record-only marketplace
backed by SOL memo TXs) or with PDA-redeployed program.

### 2. Anthropic credit balance hit
`lib/anthropic-safe.ts` wraps every `Anthropic` client with a
fallback that returns canned content on the 400 "credit balance is
too low" error. The arena/battle/agent flows continue with stub
output. To reactivate real LLM responses, add credit to the
Anthropic account.

### 3. Schema drift on first request
`lib/prisma.ts` exposes `ensureSchema()` which runs idempotent
`ALTER TABLE IF NOT EXISTS` + `CREATE TABLE IF NOT EXISTS` raw SQL
on cold starts. Vercel cold starts will heal a drifted prod DB
without manual intervention. Verify by hitting any `/api/*` route
and watching for column-missing errors in logs.

### 4. RPC rate limiting
The default `api.mainnet-beta.solana.com` is rate-limited and
unreliable under demo load. Always set `HELIUS_API_KEY` (or full
`NEXT_PUBLIC_RPC_URL_MAINNET`) before going live.

---

## Rolling back

Set `NEXT_PUBLIC_SOLANA_CLUSTER=devnet` in Vercel and redeploy. All
constants flip back to devnet values, faucet re-enables, the cluster
badge turns amber, no other changes needed.

---

## What's NOT yet automated

- Anchor program deployment is a manual `anchor deploy` against
  mainnet (out of scope for this app). The deployed program ID needs
  to be copied into `NEXT_PUBLIC_PROGRAM_ID_MAINNET` after.
- Bot wallet seeding — fund agent keypairs with mainnet SOL + USDC by
  hand or scripted before turning on autonomous flows.
- Indexer / archive — Postgres mirror is the only reads-path; for
  multi-region or analytics, plug in a separate indexer.
