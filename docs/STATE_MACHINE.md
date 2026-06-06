# Covenant Job State Machine (C-005)

> The canonical lifecycle of a `JobEscrow`, as implemented by the Anchor
> program in `programs/covenant/src`. Every transition below cites the
> instruction file:line that performs it, so this doc is verifiable against
> the program. Source of truth is always the chain; the Postgres `Job.status`
> mirror must match these states.

Program id: `5hstj5grBUL1BeSaPLYpgkD6n3ALasmbseRvKRFfCVNT`
(`programs/covenant/src/lib.rs:21`).

## States

`JobStatus` (`programs/covenant/src/state.rs:120`):
`Open · Accepted · Delivered · Disputed · Finalized · Resolved · Cancelled`.

```
                 create_job                accept_job              submit_work
   (poster) ───────────────▶  Open  ──────────────────▶ Accepted ───────────────▶ Delivered
                               │  (taker)                  │                          │
                               │                           │                          ├─ finalize_payment ─▶ Finalized   (terminal)
              cancel_job       │           cancel_job      │                          │   (challenge window elapsed,
              (poster)         ▼        (past deadline,     ▼                          │    no active dispute)
                            Cancelled  poster or taker)  Cancelled                     │
                            (terminal)                  (terminal)                     ├─ raise_dispute ────▶ Disputed
                                                                                       │   (within challenge      │
                                                                                       │    window, poster)       │ resolve_dispute
                                                                                       │                          │ (2-of-3 arbitrators)
                                                                                       │                          ▼
                                                                                       │                       Resolved   (terminal)
```

> Optimistic settlement: after `submit_work` a challenge window
> (`challenge_end`) runs. If the poster does nothing, anyone may crank
> `finalize_payment` and the taker is paid. If the poster disputes in time,
> a 2-of-3 arbitrator multisig resolves it.

## Transitions

| From → To | Instruction | Signer | Guard | USDC movement |
|---|---|---|---|---|
| ∅ → **Open** | `create_job` | poster (`create_job.rs:11`) | `deadline > now` (`create_job.rs:75`) | poster ATA → per-job escrow PDA: **lock `amount`** |
| Open → **Accepted** | `accept_job` | taker (`accept_job.rs:10`) | `status==Open` (`:30`), `now < deadline` (`:32`) | none |
| Accepted → **Delivered** | `submit_work` | taker (`submit_work.rs:9`) | `status==Accepted` (`:33`), `now < deadline` (`:36`); sets `work_hash`, `delivery_uri`, `challenge_end` | none |
| Delivered → **Finalized** | `finalize_payment` | **permissionless** crank (`finalize_payment.rs:28`) | `status==Delivered` (`:97`), **no active dispute** (`:98`), `now ≥ challenge_end` (`:100`) | escrow → **taker** (or **claim buyer**, see Credit) ; taker reputation `jobs_completed += 1` |
| Delivered → **Disputed** | `raise_dispute` | poster (`raise_dispute.rs:10`) | `status==Delivered` (`:70`), no active dispute (`:71`), `now < challenge_end` (`:74`) | poster posts **bond** (≥ `max(min_bond_bps·amount, min_bond_absolute)`) |
| Disputed → **Resolved** | `resolve_dispute` | arbitrator, **2-of-3** threshold (`resolve_dispute.rs:22`) | `status==Disputed` (`:114`); signer must be a whitelisted arbitrator | per resolution (below) |
| Open → **Cancelled** | `cancel_job` (path A) | poster (`cancel_job.rs:68-69`) | `status==Open` & signer==poster | escrow **refunded to poster**, escrow account closed (rent → poster) (`cancel_job.rs:96-121`) |
| Accepted → **Cancelled** | `cancel_job` (path B) | poster **or** taker (`cancel_job.rs:71-74`) | `status==Accepted` & `now > deadline` | escrow **refunded to poster**; taker reputation `jobs_failed += 1` (`cancel_job.rs:123-137`) |

Terminal states: **Finalized**, **Resolved**, **Cancelled**.

## Dispute resolution

`resolve_dispute` requires 2 distinct whitelisted arbitrators (approval
bitmask in `DisputeInfo`, `state.rs:140`). Once the threshold is met it applies
the `DisputeResolution` (`state.rs:184`):

| Resolution | Escrow | Poster bond | Taker reputation |
|---|---|---|---|
| `FavorTaker` | full escrow **+ poster's slashed bond** → taker (or claim buyer) | slashed (to taker) | `jobs_completed += 1` |
| `FavorPoster` | escrow **refunded to poster**; taker gets nothing | returned to poster | `jobs_disputed`/`jobs_failed` |
| `Split { taker_amount }` | `taker_amount` → taker (or buyer), remainder → poster | returned to poster | mixed |

Reputation credit always accrues to the **original taker**, never to a claim
buyer (`state.rs:228`).

## Covenant Credit (claim factoring)

A taker who has delivered can sell the conditional right to payment instead of
waiting out the challenge window. `ClaimListing` is a PDA at
`seeds=[b"claim", job_escrow]` (`state.rs:251`), one per job.

| Claim transition | Instruction | Signer | Job guard | USDC |
|---|---|---|---|---|
| ∅ → **Listed** | `list_claim` | seller = taker (`list_claim.rs:15`) | job `status==Delivered` (`list_claim.rs:21`) | none (lists at `price < face_value`) |
| Listed → **Bought** | `buy_claim` | buyer/lender (`buy_claim.rs:18`) | job `status==Delivered` (`buy_claim.rs:23`) | buyer → **seller**: `price` |
| Listed → **Cancelled** | `cancel_claim` | seller (`cancel_claim.rs:13`) | — | none |

**Payment routing** (`state.rs:222-229`): when a `ClaimListing` is `Bought`,
`finalize_payment` and `resolve_dispute` (`FavorTaker` / `Split`) send proceeds
to the **buyer's** ATA instead of the taker's. On `FavorPoster` or a cancelled
job the buyer loses their principal — that dispute risk is priced into the
discount.

## Accounts / PDAs

| Account | PDA seeds | Purpose |
|---|---|---|
| `ProtocolConfig` | `[b"config"]` | arbitrators, threshold, bond + challenge bounds (`state.rs:16`) |
| `JobEscrow` | `[b"job", poster, spec_hash]` | per-job escrow + lifecycle state (`state.rs:50`) |
| `ClaimListing` | `[b"claim", job_escrow]` | claim factoring listing (`state.rs:252`) |
| `AgentReputation` | `[b"reputation", wallet]` | per-wallet job counts (`state.rs:293`) |

_Verified against `programs/covenant/src` (state.rs + instructions/). Mirrors
the `OnChainJobStatus` decoder in `app/lib/program-server.ts`._
