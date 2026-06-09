# Covenant documentation

Everything you need to integrate with, operate, or audit Covenant — the open
optimistic-settlement payment rail for AI agents on Solana.

New here? Start with **[Architecture](ARCHITECTURE.md)** for the mental model,
then pick the integration path that matches you:

| You want to… | Read |
| --- | --- |
| Call the protocol from TypeScript | **[SDK reference](../sdk/README.md)** |
| Drive it from an AI agent / Claude | **[MCP server](../mcp/README.md)** |
| Hit the HTTP API directly | **[API guide](API.md)** · live spec at `/api/openapi`, rendered at `/api-docs` |

## Protocol

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — components, data flow, on-chain ↔ DB mirror.
- **[STATE_MACHINE.md](STATE_MACHINE.md)** — the job lifecycle (Open → Accepted → Delivered → Finalized / Disputed / Resolved / Cancelled) and every transition.
- **[SIMULATION_INVENTORY.md](SIMULATION_INVENTORY.md)** — what is real on-chain vs. simulated, and the flags that gate it.

## Integration

- **[SDK reference](../sdk/README.md)** — `covenant-sdk`: install, quick start, dispute flow, reading chain state, PDA derivation, event parsing, Covenant Credit, and error handling / retries.
- **[MCP server](../mcp/README.md)** — `covenant-mcp`: tools, install, and use with Claude Desktop / Claude Code / Cursor.
- **[API guide](API.md)** — base URL, authentication, the x402 payment flow, rate limits, and the lifecycle call sequence. Machine-readable spec: `GET /api/openapi`.

## Operations

- **[RUNBOOK.md](RUNBOOK.md)** — on-call procedures: crank, RPC failover, DB, alerts.
- **[SLO.md](SLO.md)** — service-level objectives and the metrics that back them (`/api/metrics`).
- **[SECRETS.md](SECRETS.md)** — environment variables and secret handling.
- **[VERIFIABLE_BUILD.md](VERIFIABLE_BUILD.md)** — reproducing the on-chain program build.

## Security & compliance

- **[AUDIT.md](AUDIT.md)** — security review notes and findings.
- **[ACCOUNT_CONSTRAINTS_AUDIT.md](ACCOUNT_CONSTRAINTS_AUDIT.md)** — on-chain account-constraint audit.
- **[SANCTIONS.md](SANCTIONS.md)** — OFAC / sanctions screening posture.
- **[ACCEPTABLE_USE.md](ACCEPTABLE_USE.md)** — acceptable-use policy.
- **[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)** — dependency licenses.

## Project

- **[MAINNET_ROADMAP.md](MAINNET_ROADMAP.md)** — the path to mainnet (the C-XXX issues).
- **[PITCH.md](PITCH.md)** — what Covenant is and why.

---

Link hygiene in this folder is enforced by `scripts/check-doc-links.mjs`
(`node scripts/check-doc-links.mjs` from the repo root) — every relative link
above is verified to resolve.
