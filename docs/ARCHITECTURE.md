# Covenant Architecture

## Goal

Provide a minimal, general-purpose settlement protocol that lets one party pay another party for work, without requiring a trusted intermediary, and without requiring that "work" be expressible as a machine-verifiable predicate.

The trust model is **optimistic with bonded dispute**: the protocol assumes most work will be accepted without incident, provides an automatic settlement path for that common case, and falls back to a neutral arbitrator only when the counterparty objects.

## State Machine

Every job moves through the following states:

```
          ┌─────────┐
          │  Open   │  create_job: poster locks USDC
          └────┬────┘
               │
               │ accept_job (taker claims)
               ▼
          ┌─────────┐
          │Accepted │  taker works, must deliver before deadline
          └────┬────┘
               │
               │ submit_work (taker submits work_hash + delivery_uri)
               ▼
          ┌──────────┐
          │Delivered │  challenge_end = delivered_at + challenge_period
          └────┬─────┘
               │
      ┌────────┴────────┐
      │                 │
      │ challenge_end   │ raise_dispute (poster, during window)
      │ passes          │
      ▼                 ▼
  ┌──────────┐     ┌──────────┐
  │Finalized │     │ Disputed │  escrow frozen, arbitrator takes over
  │          │     └────┬─────┘
  │ escrow   │          │
  │ → taker  │          │ resolve_dispute (arbitrator decision)
  └──────────┘          ▼
                   ┌──────────┐
                   │ Resolved │  FavorTaker / FavorPoster / Split
                   └──────────┘

cancel_job is valid from:
  - Open: poster can always cancel
  - Accepted: anyone can cancel after deadline (taker slashed for missed delivery)
```

## Instructions (Anchor program)

| Instruction | Who | From state | To state | Effect |
|---|---|---|---|---|
| `create_job` | poster | — | Open | Locks USDC into escrow PDA, records spec_hash, deadline, challenge_period |
| `accept_job` | taker | Open | Accepted | Taker claims; spec_hash verified |
| `submit_work` | taker | Accepted | Delivered | Records work_hash, delivery_uri; sets challenge_end |
| `finalize_payment` | anyone | Delivered | Finalized | Requires `now >= challenge_end` and no dispute; transfers escrow to taker |
| `raise_dispute` | poster | Delivered | Disputed | During challenge window only; poster locks bond |
| `resolve_dispute` | arbitrator | Disputed | Resolved | Arbitrator applies `DisputeResolution`; escrow + bond split accordingly |
| `cancel_job` | poster (Open) / anyone (Accepted after deadline) | Open / Accepted | Cancelled | Returns escrow to poster |
| `init_config` | admin (one-time) | — | — | Sets whitelisted arbitrator pubkeys |
| `update_arbitrators` | admin | — | — | Rotates arbitrator multisig |

## On-chain State

### ProtocolConfig

Singleton PDA storing protocol-wide parameters.

```rust
pub struct ProtocolConfig {
    pub admin: Pubkey,             // can update arbitrators
    pub arbitrators: [Pubkey; 3],  // 2-of-3 multisig (v1)
    pub threshold: u8,             // = 2
    pub min_challenge_period: u64, // = 3600 (1h)
    pub max_challenge_period: u64, // = 604800 (7d)
    pub min_bond_bps: u16,         // = 1000 (10%)
    pub min_bond_absolute: u64,    // = 1_000_000 (1 USDC in atomic units)
    pub bump: u8,
}
```

### JobEscrow

Per-job PDA seeded by `[b"job", poster, spec_hash]`.

```rust
pub struct JobEscrow {
    pub poster: Pubkey,
    pub taker: Pubkey,             // Pubkey::default() until accepted
    pub amount: u64,               // USDC atomic units
    pub spec_hash: [u8; 32],
    pub status: JobStatus,
    pub created_at: i64,
    pub deadline: i64,
    pub challenge_period: u64,     // seconds
    pub challenge_end: i64,        // 0 until Delivered
    pub delivered_at: i64,
    pub work_hash: [u8; 32],       // zeroed until Delivered
    pub delivery_uri: [u8; 200],   // fixed-size; len in delivery_uri_len
    pub delivery_uri_len: u8,
    pub dispute: Option<Dispute>,
    pub bump: u8,
}

pub enum JobStatus {
    Open,
    Accepted,
    Delivered,
    Disputed,
    Finalized,
    Resolved,
    Cancelled,
}

pub struct Dispute {
    pub challenger: Pubkey,
    pub bond: u64,
    pub reason_hash: [u8; 32],
    pub raised_at: i64,
    pub resolved_at: i64,            // 0 until resolved
    pub resolution: DisputeResolution,
    pub approvals: [Pubkey; 3],      // arbitrators that approved current resolution
    pub approval_count: u8,
}

pub enum DisputeResolution {
    Pending,
    FavorTaker,                // taker wins full escrow + bond
    FavorPoster,               // poster wins refund + bond back (taker gets nothing)
    Split { taker_amount: u64 },
}
```

### AgentReputation

Per-wallet PDA tracking lifetime stats.

```rust
pub struct AgentReputation {
    pub address: Pubkey,
    pub jobs_completed: u64,
    pub jobs_failed: u64,
    pub jobs_disputed: u64,
    pub total_earned: u64,
    pub first_job_at: i64,
    pub bump: u8,
}
```

## Trust model

### Assumptions

1. Posters and takers have keypairs and can sign transactions
2. Arbitrators are honest and will not collude (2-of-3 required in v1)
3. USDC mint on Solana is trusted (it is)
4. The Solana runtime Clock sysvar is trusted for deadlines
5. Delivery URIs resolve to content matching `work_hash` — this is enforced socially, not cryptographically, and is exactly what dispute resolution exists for

### Non-assumptions

1. We do **not** assume takers complete work on time — that's what `deadline` + post-deadline cancel covers
2. We do **not** assume the content at `delivery_uri` matches the `work_hash` — that's what disputes cover
3. We do **not** assume posters are honest — dispute bond discourages frivolous disputes
4. We do **not** assume arbitrators are available immediately — dispute state has no timeout in v1 (v2: auto-resolve in taker's favor after N days of arbitrator inactivity)

### Attack surface

- **Poster front-runs finalize:** impossible. `finalize_payment` only runs if `challenge_end` has passed AND no dispute exists.
- **Taker submits garbage and absconds:** poster raises dispute during challenge window. Garbage → FavorPoster. Taker wasted gas and got nothing.
- **Poster refuses to finalize on good delivery:** doesn't matter — `finalize_payment` is permissionless; anyone can call it after challenge period. Scripts / cron / other agents do this.
- **Poster raises frivolous dispute:** costs bond (10% of escrow or 1 USDC minimum). If arbitrator finds FavorTaker, poster loses bond. Economic disincentive.
- **Arbitrator collusion:** 2-of-3 threshold, rotatable by admin via `update_arbitrators`. v2 will replace with staked jury.
- **Delivery URI squatting (poster rejects because URI goes 404):** mitigate by using immutable storage (Arweave, IPFS). For v1 we use Vercel Blob which supports permanent URLs; if a poster hosts their own URI it's on them.

## Why not ZK

We considered and rejected a ZK-first design for the following reasons:

1. **Subjective work is most work.** ZK can verify measurable properties (word count, file size, function purity) but cannot verify quality, taste, correctness of design, or any other subjective predicate. The majority of work agents can do is subjective.

2. **Privacy is mostly theater.** A ZK proof "hides" the work input but the output is revealed at delivery anyway. Unless the work itself is encrypted and never decrypted (which means nobody ever uses it), ZK is not providing privacy.

3. **Optimistic is simpler and covers more cases.** With a 24h challenge window and a dispute path, optimistic settlement handles both objective and subjective work in a single primitive. ZK as a thesis narrows the market; optimistic as a thesis expands it.

4. **Solana's native Groth16 verifier is available if we want it later.** In v2 we may reintroduce ZK as an optional verification layer for specific job templates (e.g. "dataset has exactly 10k rows with unique primary keys"). When we do, we'll use Solana's `sol_alt_bn128_*` syscalls directly rather than binding to a specific zkVM ecosystem.

This is a design trade-off, not a capability gap. ZK is a feature of specific job templates in our roadmap, not the settlement model itself.

## Why not a fully decentralized jury (yet)

Kleros, UMA's Optimistic Oracle, and similar mechanisms require:

- A token
- A staking contract with slashing
- A random selection algorithm
- A vote-aggregation contract with commit-reveal
- A schelling point mechanism or Augur-style truth market
- An appeal system

All of these are implementable on Solana. None are implementable in a hackathon timeline with proper safety analysis. v1 uses a transparent 2-of-3 team multisig so:

1. The mechanism is **explainable** to judges in 30 seconds
2. The attack surface is **auditable** (3 pubkeys in program state)
3. v2 can **replace** the arbitrator set without a protocol redesign — the dispute resolution entry point stays the same; only the signer authorization check changes

We do not claim to be decentralized in v1. We claim to be a settlement protocol with a pluggable arbitration layer, whose arbitration layer is currently a multisig and will be a staked jury in v2.

## Off-chain components

### Database (Prisma + Neon PostgreSQL)

- `Job` — denormalized view of on-chain state for fast querying
- `Delivery` — submitted deliverable metadata (work_hash, delivery_uri)
- `Dispute` — dispute with off-chain reason text (hash committed on-chain)
- `JobEvent` — append-only log keyed by tx signature for idempotent event processing
- `Reputation` — cached view of on-chain reputation for leaderboards
- `Profile` — off-chain display name, avatar, bio

### Delivery storage (Vercel Blob)

- Client uploads work content to `/api/delivery/upload`
- Server computes SHA-256, uploads to Vercel Blob, returns `{ uri, hash }`
- Client includes `work_hash` + `delivery_uri` in on-chain `submit_work` call
- v2 will add IPFS via Pinata and Arweave adapters

### Helius integration

- **Enhanced RPC**: all Solana RPC traffic through Helius for latency + reliability
- **Webhooks**: Helius pushes every Covenant program transaction to `/api/helius/webhook`; endpoint verifies the auth header, extracts instruction + accounts, and upserts to Prisma. Idempotent via `txSignature` unique constraint.
- **Reconciliation cron**: `/api/cron/reconcile` runs every 10 minutes to catch webhook misses by scanning recent program transactions via `getSignaturesForAddress`
- **Priority fee API**: transaction builders query `/v1/priority-fee-estimate` and attach a `ComputeBudgetProgram.setComputeUnitPrice` instruction

### Finalize worker

A `/api/cron/finalize` endpoint scans for `JobStatus::Delivered` rows with expired challenge periods and submits `finalize_payment` transactions. It's a convenience — anyone can call `finalize_payment` directly — but guarantees progress even if no party wakes up to push the button.

**Scheduling:** the endpoint is driven by two independent cron paths for reliability:

1. **GitHub Actions** (primary) — `.github/workflows/covenant-crons.yml` runs every 5 minutes, 10 minutes via `curl` with a `CRON_SECRET` bearer token. Free, frequency-unlimited, works on any Vercel plan.
2. **Vercel Cron** (fallback) — `app/vercel.json` defines daily schedules at 03:00 and 03:30. This is the daily-only cap on Vercel's **Hobby** tier; upgrading to **Pro** unlocks per-minute precision and the `vercel.json` schedules can be tightened to match the GitHub Actions cadence.

Both paths hit the same endpoint; the endpoint is idempotent so double-runs are safe. The manual "Finalize now" button on the job detail page is the third path — humans can always finalize themselves.

> Vercel Hobby cron pricing: 100 cron jobs per project, **once per day only**. See `https://vercel.com/docs/cron-jobs/usage-and-pricing`. This is why the repo ships both a GitHub Actions runner and a daily `vercel.json` fallback.

## Deployment

### Program

- Program ID: set at deploy time, pinned in `app/lib/constants.ts` and `sdk/src/index.ts`
- Devnet deployment via `anchor deploy --provider.cluster devnet`
- IDL exported to `app/lib/anchor/covenant.json` and consumed by frontend + SDK

### Frontend

- Vercel (Next.js 14, App Router)
- Environment variables: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `HELIUS_API_KEY`, `HELIUS_RPC_URL`, `HELIUS_WEBHOOK_SECRET`, `DEPLOYER_KEYPAIR`, agent keypairs
- Deployed at covenant-omega.vercel.app

### Database

- Neon PostgreSQL (serverless)
- Migrations via `prisma migrate deploy` in CI
