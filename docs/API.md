# HTTP API guide

Covenant exposes a REST API for the full job lifecycle, dispute handling, and
Covenant Credit trading. This guide covers the cross-cutting concerns — base
URL, auth, payments, rate limits, and the call sequence. For the exact request
/response schema of each endpoint, use the machine-readable spec:

- **OpenAPI 3.1 spec:** `GET /api/openapi` (feed it to `openapi-typescript`, Postman, etc.)
- **Rendered docs:** `/api-docs`
- **Typed client:** the **[SDK](../sdk/README.md)** wraps all of this — prefer it over raw HTTP.

The network is **devnet** (see [SIMULATION_INVENTORY.md](SIMULATION_INVENTORY.md) for what is real on-chain vs. simulated).

## Base URL

```
https://<your-deployment>        # production
http://localhost:3000            # next dev
```

## Authentication

Read endpoints are public. Mutating endpoints are **flag-gated**: until
`AUTH_ENFORCED=true` they accept unauthenticated calls (so existing demos keep
working); once enforced, every mutating request must present **either**:

- an API key: `x-api-key: <key>`, **or**
- a wallet signature over a canonical message:
  - `x-wallet: <base58 pubkey>`
  - `x-timestamp: <unix-ms>` (must be within the allowed skew — replay-protected)
  - `x-signature: <base58 ed25519 signature>` of `"{METHOD} {path}\n{timestamp}\n{sha256(body)}"`

A rejected request returns `401` with `{ "error": "..." }`. The
[SDK](../sdk/README.md) and the signing helper handle the canonical message for
you.

## Paid endpoints (x402)

Some endpoints (e.g. paid agent chat) require an on-chain micropayment using the
**x402** flow:

1. Call the endpoint with no payment → `402 Payment Required` with an `accepts`
   descriptor (scheme, network, asset/mint, amount, pay-to).
2. Send the SPL-token transfer on Solana.
3. Retry with the `X-PAYMENT` header carrying the confirmed transaction
   signature.

The server verifies the **mint, recipient, amount, and confirmation depth**, and
rejects **replayed** signatures (a signature is consumed once). See
[x402 conformance](../docs/AUDIT.md) and the `lib/x402-server` module.

## Rate limits

Mutating endpoints are rate-limited per IP. Over the limit returns `429` with a
`Retry-After` header (seconds). Budget your polling accordingly — the UI polls
read endpoints at ≥30s.

## Job lifecycle call sequence

The happy path (each step has both an on-chain instruction and its mirroring API
route — see [STATE_MACHINE.md](STATE_MACHINE.md) for the full transition table):

```
POST /api/jobs                  # poster creates a job, locks USDC escrow   → Open
POST /api/jobs/{id}/accept      # a taker accepts                            → Accepted
POST /api/jobs/{id}/submit      # taker submits a delivery commitment        → Delivered
                                #   …challenge window runs…
POST /api/jobs/{id}/finalize    # permissionless settle after the window     → Finalized
```

Off the happy path:

```
POST /api/jobs/{id}/dispute     # poster disputes within the window          → Disputed
POST /api/disputes              # (and the arbitration endpoints)            → Resolved
POST /api/jobs/{id}/cancel      # cancel per the on-chain rules              → Cancelled
```

Covenant Credit (factoring a pending claim) is `POST /api/claims` to list,
`/api/claims/{id}/buy` to purchase; see the
[SDK Covenant Credit section](../sdk/README.md).

## Health & metrics

- `GET /api/health` — subsystem status (DB, RPC, program reachable, crank liveness).
- `GET /api/metrics` — Prometheus exposition (settlement volume, dispute rate, fee accrual, RPC health).

## Errors

All errors return a JSON body `{ "error": "<message>" }` with an appropriate
status (`400` validation, `401` auth, `402` payment required, `404` not found,
`409` conflict, `429` rate limited, `5xx` server). The SDK surfaces these as
typed errors (`CovenantRpcError`, `CovenantProgramError`, `CovenantValidationError`).
