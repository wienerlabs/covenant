# Simulation Inventory (C-001)

> Every code path that **fakes** on-chain or payment behavior, with `file:line`
> and the real replacement. This is the truth-in-state baseline for Milestone
> M0 — nothing here is real settlement, even when it returns a transaction
> signature.
>
> Status legend: 🟥 still simulated · 🟧 quarantined (fails closed in
> `SETTLEMENT_MODE=onchain`) · 🟩 removed/real.

---

## 1. Marker transactions (`sendMarkerTransaction`)

`app/lib/solana.ts` sends a **1000-lamport self-transfer** as a "marker" and
returns its signature. It proves nothing about escrow — no USDC moves, no
program is invoked — but callers store the signature as if a job/payment
settled on chain.

- **Definition:** `app/lib/solana.ts:33` — 🟧 **quarantined (C-003):** now
  `@deprecated` and throws when `SETTLEMENT_MODE=onchain`.
- **Real replacement:** the Anchor program instructions in
  `app/lib/program-server.ts` (bot/server signer) and
  `app/lib/anchor-browser.ts` (browser signer) — `create_job`, `accept_job`,
  `submit_work`, `finalize_payment`, `cancel_job`, `raise_dispute`,
  `resolve_dispute`.

### Callers (22 call sites across 11 routes) — 🟥 to be rewired in M1

| Route | Sites | Marker memos | Real replacement (M1 issue) |
|---|---|---|---|
| `app/app/api/jobs/route.ts` | 3 | `create_job`, `create_job_demo` | C-010 / C-011 real `create_job` + verify |
| `app/app/api/jobs/[id]/accept/route.ts` | 1 | `accept_job` | C-012 / C-012b |
| `app/app/api/jobs/[id]/submit/route.ts` | 1 | `submit_work` | C-013 |
| `app/app/api/jobs/[id]/finalize/route.ts` | 1 | `finalize_payment` | C-014 |
| `app/app/api/jobs/[id]/cancel/route.ts` | 1 | `cancel_job` | C-018 |
| `app/app/api/agents/hire/route.ts` | 3 | `create_job`, `accept_job`, `submit_completion` | C-019 |
| `app/app/api/arena/run/route.ts` | 3 | `arena_create_job`, `arena_accept_job`, `submit` | C-020 (bot signer) |
| `app/app/api/arena/fulfill/route.ts` | 3 | accept / submit / complete | C-020 |
| `app/app/api/autonomous/run/route.ts` | 3 | `auto_self_post`, `auto_accept`, `auto_submit` | C-020 |
| `app/app/api/battle/run/route.ts` | 2 | `battle_create`, `battle_payment` | C-020 |
| `app/app/api/hosted-agents/route.ts` | 1 | `CVNT:AGENT:<id>` metadata memo | metadata memo (non-settlement) |

> Until M1 rewires them, these remain in **simulated** mode (default), so the
> demo keeps working. Booting with `SETTLEMENT_MODE=onchain` makes every one of
> these routes return **501** at the top (`blockSimulatedRouteIfOnchain`, C-002)
> instead of faking a settlement — and `sendMarkerTransaction` itself throws
> (C-003) as a backstop.

---

## 2. x402 accept-anything fallbacks (`app/lib/x402-server.ts`)

`verifyPayment` accepts payments that were never made:

- `app/lib/x402-server.ts:110` — 🟥 `x402:<ts>:<wallet>` token passes
  **unconditionally**.
- `app/lib/x402-server.ts:~125` — a "real" tx is only checked for **existence**,
  never amount / mint / recipient.
- `app/lib/x402-server.ts:134` — final fallback accepts **any string longer than
  10 characters**.
- **Real replacement:** parse the SPL transfer and assert amount ≥ required of
  the required USDC mint to the creator, at `confirmed` commitment, single-use.
  **Addressed in PR #228 (M2 — C-030 / C-031 / C-032 / C-033 / C-034).**

---

## 3. Demo custodial / record-only paths

- `app/lib/client-escrow.ts` — 🟩 **removed (C-007):** dead custodial SPL
  transfer-to-shared-escrow builder (audit C-01 / H-02). No importers; deleted.
- `app/app/api/escrow/confirm/route.ts` — 🟩 **removed (C-022):** unused
  "demo / no-escrow" bridge that created a record-only `Job` row plus a marker
  tx. The frontend (`HireModal`, `JobWizard`) already posts to `/api/jobs`.
- `app/lib/escrow.ts` — 🟧 **partial:** `lockFundsInEscrow` / `releaseFundsToTaker`
  / `refundToPoster` are already throwing deprecated stubs. `mintTestUSDC` and
  `getTokenBalance` remain **legitimate** (the server is the test-USDC mint
  authority on devnet) and are not fakes.

---

## Addressed by this PR (M0)

- **C-001** — this inventory.
- **C-002** — `SETTLEMENT_MODE` + `COVENANT_ENV` flags (`app/lib/settlement.ts`);
  the 11 marker-tx routes (§1) now return **501** in onchain mode via
  `blockSimulatedRouteIfOnchain`, never a fake success.
- **C-003** — `sendMarkerTransaction` quarantined behind `SETTLEMENT_MODE`;
  throws in onchain mode.
- **C-005** — `docs/STATE_MACHINE.md` (canonical lifecycle).
- **C-007** — dead `client-escrow.ts` deleted.
- **C-022** — dead `/api/escrow/confirm` deleted.

The 22 marker call sites (§1) and the x402 fallbacks (§2) are tracked for M1
and PR #228 respectively; this PR makes them **honest** (quarantined /
501-guarded / inventoried), not yet real.
