# Incident runbook (C-070)

Operational playbook for Covenant. Each scenario below has concrete, ordered
steps grounded in the actual system. Keep this current as infrastructure
changes.

> **Status:** the program is deployed on **devnet** today
> (`5hstj5grBUL1BeSaPLYpgkD6n3ALasmbseRvKRFfCVNT`). These procedures are the
> standing process we carry into mainnet.

## System at a glance

| Component | Where | Notes |
|-----------|-------|-------|
| Anchor program | devnet `5hstj5gr…` | upgrade authority = deployer key (multisig planned, C-046/C-092) |
| Web app + API | Vercel | Next.js; env vars in Vercel project settings |
| Database | Neon Postgres | `DATABASE_URL` / `DIRECT_URL`; runtime schema sync in `lib/prisma.ts` |
| Auto-release crank | `GET /api/cron/finalize` | every ~5 min; signs with `CRANK_KEYPAIR`, fees only |
| Reconciler | `GET /api/cron/reconcile` | every ~10 min; heals DB↔chain drift (C-021) |
| RPC | `RPC_CHAIN` (failover) | backoff + rotate on 429/5xx (`lib/rpc-failover.ts`, C-064) |
| Health / metrics | `GET /api/health`, `/api/metrics` | DB/schema/env status; Prometheus series |

**Key env flags (the fastest levers):**
- `SETTLEMENT_MODE` — `onchain` (real) vs `simulated` (fakes return/no-op).
- `COVENANT_ENV` — declared cluster (`devnet`/`mainnet`).
- `AUTH_ENFORCED` — require signed/keyed auth on mutating routes (C-091).
- `CRON_SECRET` — gates the crank/reconcile endpoints.

**Keys / signers:** `DEPLOYER_KEYPAIR` (program upgrade + admin), `CRANK_KEYPAIR`
(finalize crank — fee-payer only, cannot redirect funds), `AGENT_ALPHA_KEYPAIR`
/ `AGENT_OMEGA_KEYPAIR` (bot wallets), arbitrator keys (2-of-3 multisig for
`resolve_dispute`).

---

## Scenario 1 — Pause the protocol

Use when a bug or exploit is suspected and you must stop state changes fast.

1. **Stop the crank.** Disable the scheduled jobs so no new `finalize_payment`
   fires: pause the Vercel Cron (or the GitHub Actions schedule in
   `.github/workflows/covenant-crons.yml`), or rotate `CRON_SECRET` so the
   endpoints 401. Verify: `GET /api/cron/finalize` returns 401.
2. **Freeze mutating routes.** Set `AUTH_ENFORCED=true` with no issued
   credentials to reject unauthenticated mutations (C-091), and/or set
   `SETTLEMENT_MODE=simulated` so still-simulated paths no-op and real-settlement
   routes refuse (`blockSimulatedRouteIfOnchain` 501, C-002/C-003).
3. **Redeploy** the env change on Vercel (env edits require a redeploy to take
   effect).
4. **Confirm** `GET /api/health` is green and `GET /api/metrics`
   `covenant_jobs_by_status` shows no further transitions.
5. **Communicate** status; open an incident note.

> The program itself has no global pause instruction today — pausing is done at
> the app/crank/env layer. (A program-level pause is a future hardening item.)

## Scenario 2 — Roll back a bad deploy

1. **App rollback (fastest):** in Vercel → Deployments, **Promote** the last
   known-good deployment to Production. This reverts code + the env snapshot
   bound to that build instantly.
2. **Env-only rollback:** if a single env var caused it, revert that var and
   redeploy; no code change needed.
3. **Database:** schema changes are additive + idempotent (`MIGRATION_SQL` /
   `ensureSchema` in `lib/prisma.ts`) so a code rollback does **not** require a
   DB rollback. If data was corrupted, restore from a Neon branch/point-in-time
   snapshot (see Scenario 5) — never hand-edit money rows.
4. **Program rollback:** the on-chain program is upgradeable by the upgrade
   authority. To revert, rebuild the previous verified artifact
   (`docs/VERIFIABLE_BUILD.md`) and `anchor upgrade` / `solana program deploy`
   with the prior `.so`. Confirm the on-chain hash matches via the
   `Verifiable build` workflow.
5. **Reconcile:** run `GET /api/cron/reconcile` to heal any DB↔chain drift the
   rollback introduced (C-021), then verify `/api/health`.

## Scenario 3 — Key compromise

Identify which key leaked; the blast radius differs.

- **`CRANK_KEYPAIR` (crank):** lowest risk — it only pays SOL fees and **cannot
  redirect funds** (the program enforces payout to the registered taker).
  Mitigate: generate a new keypair, fund it, set `CRANK_KEYPAIR`, redeploy; drain
  the old key's SOL.
- **`AGENT_*_KEYPAIR` (bot wallets):** at-risk = those bots' own USDC + any open
  jobs they're party to. Mitigate: rotate the env keypair, move funds to a fresh
  wallet, re-register the agent.
- **Arbitrator key:** dispute resolution is **2-of-3 multisig**, so one leaked
  arbitrator cannot resolve alone. Rotate it via `update_arbitrators`
  (init-config authority) and review recent `resolve_dispute` txs.
- **`DEPLOYER_KEYPAIR` (upgrade + admin authority): CRITICAL.** An attacker could
  upgrade the program. Mitigate immediately: transfer the program's upgrade
  authority to a new key (`solana program set-upgrade-authority`), rotate
  `ADMIN_SECRET`, and audit recent admin actions in the `AdminAuditLog` table
  (C-095). Move to the planned multisig upgrade authority (C-046) as the durable
  fix. Never store this key in `/tmp` in production (C-063).

In all cases: rotate the secret in Vercel, redeploy, and document the timeline.

## Scenario 4 — RPC outage

1. **Expected automatic behavior:** `lib/rpc-failover.ts` (C-064) already backs
   off on 429/5xx and rotates across `RPC_CHAIN`; a single provider outage should
   self-heal. Watch `covenant_db_up` + error logs to confirm rotation
   (`[rpc-failover] rotated to …`).
2. **All providers degraded:** add/promote a healthy endpoint by editing
   `RPC_CHAIN` (Helius primary + a second provider) and redeploy. If you are
   being rate-limited, set/lower `RPC_RATE_BUDGET_PER_SEC` to stay under plan
   limits.
3. **Effect on settlement:** the crank will retry on the next tick; no funds are
   lost — escrow stays on-chain until a `finalize_payment` lands. Once RPC
   recovers, the crank catches up and the reconciler heals any DB lag.
4. **Verify recovery:** `GET /api/health` green; crank logs show real tx
   signatures again.

---

## After any incident

1. Confirm `/api/health` green and `/api/cron/reconcile` reports zero unhealed
   drift.
2. Write a short postmortem (timeline, root cause, fix, prevention).
3. If a security issue, follow `SECURITY.md` disclosure + add a regression test
   so it cannot silently reopen.
