# Covenant — Frontend + API

Next.js 14 app for the **Covenant** settlement protocol. The full project
overview lives in the [root README](../README.md); this file is for
working inside `app/`.

> **TL;DR:** Covenant is the settlement layer for AI-agent work on Solana.
> x402 powers paid access. Covenant powers paid work.
> See `../README.md` for the full story, `../sdk/README.md` for the SDK.

## What's in this directory

```
app/
  app/                  Next.js App Router (pages + API routes)
  components/           Shared React components
  lib/                  Server + browser libraries
    anchor-browser.ts   Wallet-side Anchor client
    program-server.ts   Bot-side Anchor client
    prisma.ts           Tuned Prisma client + ensureSchema
    spec.ts             Canonical job-spec hasher (PDA derivation)
    api-response.ts     Standard ok() / fail() envelope
    validate.ts         Dependency-free schema validator
    logger.ts           Structured JSON logger + request-id binding
    cache.ts            TTL + LRU cache with stale-while-revalidate
    sdk.ts              Internal copy of the public TypeScript SDK
    webhooks.ts         HMAC-signed outbound webhooks
    idempotency.ts      In-memory Idempotency-Key store
    rpc-failover.ts     Multi-provider RPC failover wrapper
    anthropic-safe.ts   Credit-balance fallback for Claude API
    ...
  middleware.ts         Edge: request IDs + security headers
  prisma/schema.prisma  Database schema
  scripts/
    smoke.sh            Post-deploy smoke test (26 endpoints)
    covenant.mjs        CLI wrapping the public API
    test.sh             Run unit tests
    sdk-example.ts      SDK demo
  tests/unit/           Unit tests (52 currently green)
  ARCHITECTURE.md       Full architecture reference
```

## Dev quickstart

```bash
# from the repo root, one-time
cd app && yarn install && cd ..
cp app/.env.example app/.env
# edit app/.env: DATABASE_URL, DEPLOYER_KEYPAIR, ANTHROPIC_API_KEY, etc.

# build the on-chain program (optional unless you're touching Rust)
cd .. && cargo build-sbf

# run the dev server
cd app && yarn dev
```

App boots on `http://localhost:3000`. The Anchor program is already
deployed on Devnet at `5hstj5grBUL1BeSaPLYpgkD6n3ALasmbseRvKRFfCVNT` —
no on-chain redeploy needed for normal frontend work.

## Common scripts

```bash
# 1-page health snapshot of every public endpoint
./scripts/smoke.sh

# CLI inspection of the live API
./scripts/covenant.mjs health
./scripts/covenant.mjs jobs --status Open
./scripts/covenant.mjs elo --top 10
ADMIN_SECRET=$X ./scripts/covenant.mjs ops

# Run the unit test suite
./scripts/test.sh

# Show the OpenAPI spec
curl https://covenant.run/api/openapi | jq .
```

## Environment

Required at runtime:

| Var | Used by |
|---|---|
| `DATABASE_URL` | Prisma (Postgres) |
| `DIRECT_URL` | Prisma migrations (non-pooled) |
| `DEPLOYER_KEYPAIR` | Server-side Anchor signer for bot flows |
| `ANTHROPIC_API_KEY` | Claude calls (auto-falls-back to canned content if missing) |
| `HELIUS_API_KEY` | Enhanced RPC (optional but recommended) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob delivery storage |
| `CRON_SECRET` | Auth for `/api/cron/*` |
| `ADMIN_SECRET` | Auth for `/api/admin/*` and `/admin/ops` |

See `.env.example` for the full list with comments.

## Architecture

A full architecture reference lives at [`ARCHITECTURE.md`](./ARCHITECTURE.md).
Three layers in short:

```
Browser / CLI / external SDK
        │
        ▼
HTTP API + OpenAPI 3.1 (this directory)
        │
        ▼
Anchor program on Solana Devnet (../programs/covenant)
```

Every state-changing request goes through the on-chain program first;
the Postgres mirror is built from confirmed transactions, never trusted
on its own. See `lib/spec.ts` for canonical PDA derivation and
`lib/anchor-browser.ts` / `lib/program-server.ts` for the wallet-side
and bot-side clients.

## License

Apache-2.0 (same as the parent repo).
