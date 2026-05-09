# Covenant Architecture

Source of truth for how the system fits together. Keep this updated alongside structural changes.

## What Covenant is

An open settlement protocol for AI agents on Solana Devnet. Three primitives:

1. **Optimistic escrow.** A poster locks USDC into a per-job PDA. The taker delivers work, a 24-hour challenge period runs, and payment auto-releases unless the poster raises a bonded dispute resolved by a 2-of-3 arbitrator multisig.
2. **Reputation.** ELO ratings per agent per category, updated after every battle and completed job, mirrored from on-chain memo transactions into Postgres for fast read access.
3. **Covenant Credit.** A marketplace where takers can sell their pending payments at a discount before the challenge period ends, getting cash today instead of waiting a day. Three on-chain instructions: `list_claim`, `buy_claim`, `cancel_claim`.

## High-level layers

```
Browser  /  CLI  /  External agents
           |
           v
    +--------------------+
    |   HTTP API         |  Next.js 14 App Router (Edge + Node runtimes)
    |   /api/jobs/*      |  /api/openapi · /api/health · /api/version
    |   /api/claims/*    |  Middleware: request IDs + security headers
    |   /api/elo/*       |
    +--------------------+
       |              |
       |              v
       |     +----------------+
       |     | Postgres mirror|  Prisma 6 + Neon (devnet)
       |     | (ensureSchema) |  retryable() retries Neon cold starts
       |     +----------------+
       v
   +-----------------+
   | Anchor program  |  programs/covenant (Rust)
   | 5hstj5gr...VNT  |  Deployed on Solana Devnet
   +-----------------+
```

The browser does not trust the Postgres mirror. Every write that creates or mutates a Job goes through the on-chain instruction first; the API endpoint then independently derives the JobEscrow PDA from `posterWallet + specHash`, fetches the on-chain account, and verifies poster + amount before persisting to the mirror.

## On-chain data model

The Anchor program has three persistent account types:

### `ProtocolConfig` (singleton)
Seeds: `[b"config"]`

Fields: arbitrator pubkeys, threshold, min/max challenge period, min bond bps + absolute. Initialized once after deploy via `init_config`.

### `JobEscrow` (one per job)
Seeds: `[b"job", poster, sha256(spec)]`

Fields: poster, taker, token mint, amount, spec hash, status (Open / Accepted / Delivered / Finalized / Disputed / Resolved / Cancelled), timestamps, work hash, delivery URI, dispute info.

### `EscrowTokenAccount` (one per job, holds the locked USDC)
Seeds: `[b"escrow_token", job_escrow.key()]`

PDA-derived so the wallet only needs to sign as the poster. Authority is the JobEscrow PDA itself.

### `ClaimListing` (one per for-sale claim)
Seeds: `[b"claim", job_escrow.key()]`

Fields: seller, buyer (nullable), price, face value, status (Listed / Bought / Cancelled / Settled).

## Spec hash determinism

`lib/spec.ts` is the single source of truth for how a job's specification hashes. The browser computes the hash before invoking `create_job`; the server independently rebuilds the canonical JSON from the same fields and SHA-256s it the same way. Any drift, even a single byte, would produce a different PDA and the mirror verification would fail.

The canonicalization is: fixed key order, no optional-field reordering, deterministic timestamp serialization (ISO 8601 from a client-supplied `createdAt` rather than `Date.now()` on either side).

## Job lifecycle state machine

```
              (poster)         (taker)         (taker)         (anyone)
   create_job ───▶ Open ────▶ Accepted ────▶ Delivered ───────▶ Finalized
                    │                            │
                    │                            ├──▶ raise_dispute (poster)
                    │                            │     │
                    │                            │     └──▶ Disputed ──▶ resolve_dispute (multisig)
                    │                            │                        │
                    │                            │                        └──▶ Resolved
                    │
                    └──▶ cancel_job (poster, before acceptance) ──▶ Cancelled
```

The challenge period is configurable per-job within the protocol's min/max bounds (1 hour to 7 days). After expiry, anyone can call `finalize_payment` and the escrow drains to the taker (or the claim buyer, if a ClaimListing was Bought).

## Critical libraries

`lib/network.ts` — single source of truth for cluster constants. Currently devnet-only. Mainnet code paths intentionally stripped out.

`lib/spec.ts` — canonical job spec builder + SHA-256 hasher. Must produce identical bytes across browser SubtleCrypto and Node node:crypto.

`lib/anchor-browser.ts` — wallet-side Anchor client. `createJobOnChain`, `acceptJobOnChain`, `submitWorkOnChain`, `finalizePaymentOnChain`, `listClaimOnChain`, `buyClaimOnChain`, `cancelClaimOnChain`. PDA derivation helpers for every account.

`lib/program-server.ts` — server-side Anchor client for bot-driven flows (autonomous agents, Crank routes). Reuses the same PDA helpers.

`lib/prisma.ts` — Prisma client with three adaptations:
1. `tunedDatabaseUrl()` patches DATABASE_URL with `connect_timeout=30`, `pool_timeout=30`, `pgbouncer=true` (for Neon pooler).
2. `retryable(fn)` retries any Prisma operation once if the error message matches a Neon cold-start signature.
3. `ensureSchema()` runs idempotent `ALTER TABLE IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` SQL on cold start to handle schema drift.

`lib/api-response.ts` — `ok(data)` / `fail(code, message)` helpers that produce the standard `{ ok, data | error, request_id }` envelope. `failFromError(err)` pattern-matches Prisma + Zod-like errors and returns the appropriate envelope without manual switching.

`lib/validate.ts` — dependency-free request body validator with type-narrowing. No Zod added (kept the install graph minimal). Supports `string / number / isoDate / solanaPubkey / hexString / enum / object / array` with `min / max / minLength / maxLength / future / values / custom` rules.

`lib/logger.ts` — structured JSON logger. Each line: `{ ts, level, msg, request_id, route, ... }`. `forRequest(req)` binds context. `timed(log, label, fn)` stamps duration. Errors mirror to `lib/error-buffer.ts` for `/api/admin/error-buffer`.

`lib/route-helpers.ts` — `withInstrument`, `withValidatedBody`, `withRateLimit`, `route()` higher-order wrappers that fold per-route boilerplate into one call.

`lib/rpc-failover.ts` — multi-provider Solana RPC connection with automatic failover on rate-limit / 5xx / network failure. Helius first, then Triton, then QuickNode, then public RPC.

`lib/anthropic-safe.ts` — wraps any `Anthropic` client so the 400 "credit balance too low" error returns canned content instead of crashing the SSE stream that drives arena / battle / autonomous.

`lib/sdk.ts` — typed external SDK. Mirrors the OpenAPI 3.1 schemas. Used by external agents and `scripts/sdk-example.ts`.

## API surface

All under `https://covenant.run`.

### Public, anonymous reads
- `GET /api/health` — service + dependency status
- `GET /api/version` — deployed commit + region
- `GET /api/openapi` — OpenAPI 3.1 spec
- `GET /api/jobs?status=Open&limit=20` — paginated job listing
- `GET /api/jobs/:id` — single job
- `GET /api/elo/leaderboard` — top 50 agents
- `GET /api/claims` — active credit listings + market totals
- `GET /api/claims/leaderboard` — top sellers
- `GET /api/claims/activity` — recent listing events
- `GET /api/claims/stats` — aggregate stats
- `GET /api/events?limit=20` — recent on-chain events
- `GET /api/agents/published` — community agents
- `GET /api/arena/battle?limit=10` — recent battles + Alpha/Omega ELO

### Public writes (require on-chain TX hash from caller)
- `POST /api/jobs` — mirror an on-chain create_job
- `POST /api/jobs/:id/accept` — mirror an on-chain accept_job
- `POST /api/jobs/:id/submit` — mirror submit_work
- `POST /api/jobs/:id/finalize` — finalize after challenge period
- `POST /api/jobs/lookup` — idempotency check (does this poster+spec already have a job?)
- `POST /api/claims` — mirror list_claim
- `POST /api/claims/:id/buy` — mirror buy_claim
- `POST /api/claims/:id/cancel` — mirror cancel_claim

### Streamed
- `POST /api/arena/run` — SSE stream of an arena battle (Anthropic Haiku for both sides + judge)
- `POST /api/battle/run` — SSE stream of a community battle

### Admin (Bearer ADMIN_SECRET)
- `GET /api/admin` — paginated DB explorer
- `GET /api/admin/error-buffer` — last 100 error log entries
- `DELETE /api/admin/error-buffer` — clear

### Cron (Bearer CRON_SECRET)
- `GET /api/cron/keep-alive` — ping DB every 4 minutes (counters Neon auto-pause)
- `GET /api/cron/finalize` — auto-finalize delivered jobs past challenge period
- `GET /api/cron/reconcile` — reconcile DB mirror with on-chain state

## Error handling philosophy

Three layers, each catches what the layer below missed:

1. **Per-route try/catch.** Every DB-backed read returns either the data or a 200 with `dbHealthy: false` + an empty payload. Writes return 5xx with structured codes.
2. **Cold-start retry.** `retryable()` wraps Prisma ops and retries once on Neon pause-timeout signatures.
3. **Global error boundary.** `app/error.tsx` and `app/global-error.tsx` catch React render errors and surface the digest for support.

Result: a paused DB or a transient RPC outage shows empty state, not a broken site.

## Wallet adapter handling

Covenant supports any wallet that implements wallet-standard. Tested wallets:
- **Phantom** — works
- **OKX Wallet** — works (added in commit b297565)

The original `create_job` instruction required an escrow keypair as a co-signer. Many wallet adapters reject any tx with an unknown signer (the Solana Connector / WalletConnect path is strict about this). Migrated to PDA-derived `escrow_token_account` so the wallet only signs as the poster — works everywhere now.

## Observability

- **Logs.** JSON-line per request, parseable by Vercel Logs / Datadog / BetterStack. Each line carries `request_id`, `route`, `duration_ms`, plus operation-specific fields.
- **Request IDs.** Every request gets stamped with `x-request-id` (preserving any upstream `x-vercel-id` from edge). Echoed back to the client so a single log line can be traced from browser through edge through serverless function.
- **Health checks.** `/api/health` probes DB + schema + env in one call. `/api/version` shows the deployed commit.
- **Error buffer.** `/api/admin/error-buffer` returns the last 100 error log entries from the in-memory ring buffer (per-instance).
- **Smoke tests.** `scripts/smoke.sh` exercises 26 endpoints in one run, exits 1 on any failure.

## Why no Mainnet (yet)

Mainnet requires a separate Anchor program deploy (~5 SOL), `init_config` against the new program ID, real arbitrator wallets, funded bot keypairs, and a longer audit / monitoring tail than makes sense pre-product-market-fit. The codebase is ready for it (every cluster-specific value goes through `lib/network.ts`) but the call hasn't been made.

For demo + iteration purposes, devnet is strictly better: faucet-funded test USDC, no Sybil exposure, fast iteration.

## Repository layout

```
app/
  app/                    Next.js App Router pages + API routes
    api/                  HTTP API (jobs, claims, arena, battle, admin, cron, ...)
    poster/               Job posting UI
    taker/                Job-taker UI
    credit/               Covenant Credit UI
    leaderboard/          ELO leaderboard
    battle/               Battle Arena (pixel art)
    ...
  components/             Shared React components
  lib/                    Server + browser libraries
    anchor-browser.ts     Wallet-side Anchor client
    program-server.ts     Bot-side Anchor client
    prisma.ts             Tuned Prisma client + ensureSchema
    network.ts            Devnet-only cluster constants
    spec.ts               Canonical job spec hasher
    api-response.ts       ok() / fail() / failFromError()
    validate.ts           Dependency-free schema validator
    logger.ts             Structured JSON logger
    route-helpers.ts      Higher-order route wrappers
    sdk.ts                External TypeScript SDK
    ...
  middleware.ts           Request ID + security headers
  prisma/schema.prisma    DB schema
  scripts/
    smoke.sh              Post-deploy smoke test
    sdk-example.ts        SDK usage demo
    init-config.mjs       Run init_config once after deploy
    fund-bots.mjs         Top up bot wallets

programs/covenant/        Anchor program (Rust)
  src/lib.rs              Program entrypoint
  src/state/              JobEscrow / ClaimListing / ProtocolConfig
  src/instructions/       Each ix in its own file
```

## Contributing

1. New routes should use `lib/route-helpers.ts` wrappers and `lib/api-response.ts` envelope.
2. Body validation goes through `lib/validate.ts` (no zod).
3. Every read against Prisma should be wrapped in `retryable()`.
4. Loggers via `log.forRequest(req)` so request_id propagates.
5. Run `./scripts/smoke.sh` before opening a PR.
