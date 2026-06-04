# Covenant — Road to Real On-Chain + x402 + Mainnet

> Goal: make every advertised behavior actually true on-chain, replace the
> simulated x402 and "marker transaction" settlement with real Solana
> transactions, migrate to mainnet behind an audit, add legal (Terms of
> Use / Privacy), and ship a final completion test suite.
>
> **Owners:** `@kh0ra` (Aral) and `@mehmet` (Full Mehmet). Each issue lists
> an **Owner** (does the work) and a **Reviewer** (approves the PR). If
> Mehmet's GitHub handle is not literally `@mehmet`, find-and-replace it.
>
> **Labels** used below: `blocker`, `onchain`, `x402`, `mainnet`, `security`,
> `legal`, `sdk`, `mcp`, `infra`, `frontend`, `backend`, `test`, `docs`,
> `audit`, `cleanup`.
>
> **Milestone order is dependency order.** Do not start M4 (mainnet) before
> M1–M3 are green. Each issue has Acceptance Criteria (AC) that must pass
> before close.

---

## Ground-truth audit (why this roadmap exists)

Confirmed gaps in the current codebase:

1. `app/lib/solana.ts::sendMarkerTransaction` sends a 1000-lamport self
   transfer as a "marker", not a real escrow. The HTTP lifecycle routes
   (`/api/jobs`, `/api/jobs/[id]/accept|finalize|cancel`, `/api/agents/hire`,
   `/api/escrow/confirm`, `/api/arena/*`, `/api/battle/run`, `/api/autonomous/run`)
   call it instead of the real Anchor program. Settlement is theater on
   the API path.
2. `app/lib/x402-server.ts::verifyPayment` has three accept-anything paths:
   `x402:<ts>:<wallet>` tokens pass unconditionally; "real" txs are only
   checked for existence, not amount/recipient/mint; and a final fallback
   accepts any string longer than 10 chars. x402 is not real.
3. `Anchor.toml` is devnet-only; deployer wallet is read from `/tmp`.
4. No Terms of Use, Privacy Policy, or risk disclosures anywhere.
5. The real Anchor program (`programs/covenant`, 13 instructions) and the
   real client/bot signers (`anchor-browser.ts`, `program-server.ts`) exist
   but are not the path most flows take.

---

# MILESTONE 0 — Truth-in-state & teardown of fakes

> Make the codebase honest before rebuilding. Flag every simulated path,
> add a feature flag to fail-closed in prod, and write the contract tests
> that the real implementation must satisfy.

### C-001 · Inventory every simulated/mock code path
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** audit, cleanup, blocker
- Produce `docs/SIMULATION_INVENTORY.md` listing every file/function that
  fakes on-chain or payment behavior (marker tx, x402 fallbacks, demo
  custodial paths, seeded data writers).
- **AC:** Every `sendMarkerTransaction` caller, every x402 accept-fallback,
  and every `console.log`-only "tx" is enumerated with file:line and a
  "real replacement" note.

### C-002 · Add `COVENANT_ENV` + `SETTLEMENT_MODE` runtime flags
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** infra, backend, blocker
- Introduce `SETTLEMENT_MODE = "simulated" | "onchain"` and `COVENANT_ENV =
  "devnet" | "mainnet"`. In `onchain` mode, any simulated path must throw,
  not silently fake.
- **AC:** Booting with `SETTLEMENT_MODE=onchain` and hitting a still-faked
  route returns HTTP 501 with a clear message, never a fake success.

### C-003 · Quarantine `sendMarkerTransaction` behind the flag
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** onchain, cleanup
- Mark deprecated; throw if called when `SETTLEMENT_MODE=onchain`.
- **AC:** Unit test asserts it throws in onchain mode.

### C-004 · Write the settlement contract test spec (red tests first)
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** test, onchain, blocker
- Author failing tests describing the real lifecycle: create_job locks USDC
  in escrow PDA, accept_job binds taker, submit_work records hash,
  finalize_payment moves USDC to taker, dispute path moves correctly.
- **AC:** A `tests/onchain/lifecycle.spec.ts` exists, currently failing,
  that the rest of M1 must make pass on devnet.

### C-005 · Document the canonical job state machine
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** docs, onchain
- One diagram + table: states, allowed transitions, the instruction that
  performs each, who can sign, and what USDC movement happens.
- **AC:** `docs/STATE_MACHINE.md` reviewed and matches the Anchor program.

### C-006 · CI gate: block merges that reintroduce fakes in onchain mode
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** infra, test
- Add a CI check that greps for banned calls in onchain-flagged routes.
- **AC:** CI fails if a route under `/api/jobs` imports `sendMarkerTransaction`.

### C-007 · Remove dead `client-escrow.ts` / reconcile escrow libs
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** cleanup
- Three escrow-ish libs exist (`escrow.ts`, `client-escrow.ts`,
  `anchor-client.ts`). Decide the one true client, delete the rest.
- **AC:** Exactly one client module remains; imports updated; build green.

### C-008 · Add a status badge to the app showing settlement mode
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** frontend
- A small honest badge ("devnet · on-chain" / "simulated") so demos never
  misrepresent what's happening.
- **AC:** Badge reads from `COVENANT_ENV`/`SETTLEMENT_MODE`.

---

# MILESTONE 1 — Real on-chain job lifecycle (kill marker tx)

> Wire every job lifecycle route to the real Anchor program. Users sign in
> their own wallet (browser); bots sign with their own keypair (server).
> No custodial movement, no marker tx.

### C-010 · Real `create_job` from the poster UI
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** onchain, frontend, blocker
- `/poster` builds + signs `create_job` via `anchor-browser.ts`, locks USDC
  into the job escrow ATA, then POSTs the tx signature for verification.
- **AC:** A posted job shows a real escrow ATA holding the USDC on Solana
  Explorer; DB mirrors only after `verifyTxInvokedCovenant` passes.

### C-011 · Server-side verification of `create_job` tx
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** onchain, backend, security
- `/api/jobs` POST must parse the submitted tx, confirm it invoked our
  program, the escrow holds the stated amount + mint, and the PDA derives
  from `[b"job", poster, spec_hash]`. Reject mismatches.
- **AC:** Forged or under-funded tx is rejected; DB never records unverified jobs.

### C-012 · Real `accept_job` flow
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** onchain, frontend
- `/taker` accept signs `accept_job` with spec_hash verification.
- **AC:** Acceptance fails on-chain if spec_hash mismatches; UI reflects the
  real on-chain taker binding.

### C-012b · Server verification of `accept_job`
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** onchain, backend
- **AC:** `/api/jobs/[id]/accept` only mirrors after confirming the on-chain
  JobEscrow.taker == submitter and status == Accepted.

### C-013 · Real `submit_work` with on-chain commitment
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** onchain, frontend
- Deliverable hashed with RFC 8785 canonical JSON + SHA-256; `submit_work`
  records `work_hash` + `delivery_uri` on-chain; challenge window starts
  from the on-chain clock, not `Date.now()`.
- **AC:** `challengeEndAt` is derived from the on-chain timestamp; UI
  countdown matches chain.

### C-014 · Real `finalize_payment` (permissionless crank)
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** onchain, backend, blocker
- Replace the marker-tx finalize with a real `finalize_payment` call. Anyone
  can crank; the program enforces payout to the registered taker.
- **AC:** After the window, USDC actually moves from escrow ATA to taker ATA
  on Explorer; double-finalize reverts.

### C-015 · Cron crank service for auto-release
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** onchain, infra
- `cron/finalize` runs `finalize_payment` on every Delivered job past its
  window using `CRANK_KEYPAIR` (fees only, cannot redirect funds).
- **AC:** A delivered job left untouched auto-settles within one cron tick
  after expiry; logs show the real tx.

### C-016 · Real `raise_dispute` with bonded challenge
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** onchain, frontend
- Poster posts a bond (same mint as escrow) to dispute within the window.
- **AC:** Dispute requires a real bond transfer; bond mint constrained to
  escrow mint; UI shows bond locked.

### C-017 · Real `resolve_dispute` via 2-of-3 multisig
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** onchain, security, blocker
- Two of three arbitrators sign the resolution; program distributes escrow
  + bond per outcome (FavorTaker / FavorPoster / Split).
- **AC:** Single arbitrator cannot move funds; threshold enforced; Split
  amount validated against escrow total.

### C-018 · Real `cancel_job` + refund
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** onchain, backend
- Poster (or past-deadline taker) cancels; escrow refunds on-chain.
- **AC:** Refund tx visible on Explorer; only poster/taker can cancel.

### C-019 · Replace marker tx in `/api/agents/hire`
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** onchain, backend
- Hiring a built-in/hosted agent must post a real job + escrow, then the
  agent (bot keypair) accepts and delivers on-chain.
- **AC:** A hire produces a real on-chain job, not a memo.

### C-020 · Bot agents transact with their own keypair on-chain
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** onchain, backend
- Arena/autonomous bot flows use `program-server.ts` real signers, not
  marker tx. Each bot is the principal; never holds another user's funds.
- **AC:** Arena run produces real `accept_job`/`submit_work`/`finalize` txs.

### C-021 · Reconcile DB mirror with on-chain as source of truth
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** onchain, backend
- A reconciler reads on-chain JobEscrow accounts and repairs DB drift.
- **AC:** Manually corrupting a DB row is auto-healed from chain on next read.

### C-022 · Remove `/api/escrow/confirm` marker path
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** onchain, cleanup
- **AC:** Endpoint either does real verification or is deleted; no marker tx.

### C-023 · Handle Solana failure modes in every signed flow
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** onchain, backend
- Blockhash expiry, insufficient SOL for fees, ATA-not-found, simulation
  failure, RPC 429. Each maps to a clear UI error and a safe DB state.
- **AC:** Each failure mode has a test and never half-commits the DB.

### C-024 · USDC ATA bootstrap helper (create-if-missing)
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** onchain, frontend
- First-time posters/takers may lack a USDC ATA; create it in the same flow.
- **AC:** A wallet with no USDC ATA can complete a job without manual setup.

### C-025 · Compute-budget + priority fee handling
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** onchain, infra
- Add compute-unit limit + priority fee to lifecycle txs so they land under
  load (important for mainnet).
- **AC:** Txs confirm under simulated congestion in test.

---

# MILESTONE 2 — Real x402 payments

> Replace the always-accept x402 with a real Solana payment verification:
> correct amount, correct recipient, correct mint, on-chain confirmed, and
> replay-proof. Conform to the x402 spec so external x402 clients work.

### C-030 · Remove all x402 accept-anything fallbacks
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** x402, security, blocker
- Delete the `x402:<ts>:<wallet>` bypass and the "len>10 ⇒ valid" fallback.
- **AC:** `verifyPayment` returns valid only after real on-chain checks; a
  unit test proves every legacy bypass now fails.

### C-031 · Verify payment amount, recipient, and mint on-chain
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** x402, backend, blocker
- Parse the SPL transfer in the referenced tx: assert it transfers ≥ the
  required amount of the required mint (USDC) to the creator's wallet.
- **AC:** Underpayment, wrong mint, or wrong recipient all reject.

### C-032 · Replay protection for x402 payments
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** x402, security
- A tx signature can be spent once; persist consumed signatures.
- **AC:** Re-submitting the same payment tx for a second prompt is rejected.

### C-033 · Conform to the x402 HTTP 402 spec (headers + scheme)
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** x402, backend
- Validate the `Payment-Required` / `Payment-Signature` header shapes against
  the published x402 schema; support the Solana payment scheme exactly.
- **AC:** A reference x402 client can pay a Covenant agent without custom code.

### C-034 · Settlement window / confirmation depth for payments
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** x402, onchain
- Require confirmed (not processed) commitment before granting access.
- **AC:** A dropped/forked payment tx does not grant access.

### C-035 · x402 facilitator integration (optional path)
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** x402, backend
- Support verifying via an x402 facilitator service as an alternative to
  direct RPC parsing; behind a flag.
- **AC:** Facilitator path verified end-to-end in test.

### C-036 · Idempotent payment-gated chat
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** x402, backend
- A verified payment maps to exactly one served response; retries don't
  double-charge or double-serve.
- **AC:** Network-retry of a paid chat returns the same response, one charge.

### C-037 · Creator payout accounting reconciled to chain
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** x402, backend
- `AgentRevenue` rows must correspond to real on-chain transfers.
- **AC:** Revenue dashboard total equals sum of verified on-chain payments.

### C-038 · x402 error UX
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** x402, frontend
- Clear states: payment required, pending confirmation, verified, failed.
- **AC:** Each state rendered; no infinite spinners.

### C-039 · x402 unit + integration test suite
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** x402, test
- **AC:** Coverage for amount/mint/recipient/replay/confirmation, all green.

---

# MILESTONE 3 — Anchor program hardening & audit prep

> Lock down the program before it touches real money on mainnet.

### C-040 · Re-derive and pin all PDA seeds; document them
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** onchain, audit
- **AC:** Every PDA seed documented; no collisions; tests assert derivation.

### C-041 · Arithmetic overflow / checked math audit
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** onchain, audit, security
- **AC:** All `u64` math uses checked ops; fuzz test for Split amounts.

### C-042 · Account validation / ownership constraints review
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** onchain, audit, security
- Every account constraint (`has_one`, `mint`, `authority`, `signer`) reviewed.
- **AC:** Negative tests prove wrong accounts are rejected on every ix.

### C-043 · Reentrancy / double-spend / state-transition guards
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** onchain, audit
- **AC:** Tests prove no instruction can run out of its allowed state.

### C-044 · Mandatory claim-listing routing on finalize/resolve
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** onchain, audit
- Confirm a sold claim cannot be bypassed by omitting the listing account.
- **AC:** Test: selling a claim then finalizing pays the buyer, not the taker.

### C-045 · Protocol fee instruction (configurable bps, fee vault)
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** onchain, mainnet
- Add on-chain fee capture (default 20 bps) to `finalize_payment`/`resolve`,
  routed to a fee vault; configurable via `init_config`.
- **AC:** Fee actually accrues to the vault on settlement; 0-fee config works.

### C-046 · Upgrade authority + program governance plan
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** onchain, mainnet, security
- Decide multisig upgrade authority (e.g., Squads) for mainnet; document.
- **AC:** Mainnet program upgrade authority is a multisig, not a single key.

### C-047 · Deterministic + verifiable builds
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** onchain, audit, infra
- `anchor build --verifiable`; publish the build hash.
- **AC:** Reproduced build hash matches the deployed program.

### C-048 · Full Anchor test coverage on localnet
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** onchain, test, blocker
- Happy path + every revert path for all 13 instructions.
- **AC:** `anchor test` green with ≥90% instruction-branch coverage.

### C-049 · External audit engagement + fix cycle
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** audit, mainnet, blocker
- Engage an auditor; triage findings (C/H/M/L); fix C+H before mainnet.
- **AC:** Audit report attached; all Critical/High resolved + re-tested.

### C-050 · Bug-bounty scope + disclosure policy
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** security, docs
- **AC:** `SECURITY.md` with scope, severity, and a disclosure email.

---

# MILESTONE 4 — Mainnet migration

### C-060 · Parameterize cluster everywhere (no hardcoded devnet)
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** mainnet, infra, blocker
- All RPC URLs, USDC mint, program ID, explorer links read from env.
- **AC:** Flipping `COVENANT_ENV=mainnet` changes every reference; no string
  literal `devnet` remains in app code.

### C-061 · Mainnet USDC mint + decimals constants
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** mainnet, onchain
- **AC:** `EPjFW…TDt1v` mainnet USDC wired; amounts use 6 decimals correctly.

### C-062 · Deploy program to mainnet-beta
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** mainnet, onchain, blocker
- Deploy the audited build; record the mainnet program ID.
- **AC:** Program live on mainnet; ID committed to config + README.

### C-063 · Secure deployer + crank + arbitrator keys (no /tmp)
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** mainnet, security, blocker
- Move keys out of `/tmp`; use a secrets manager; crank key is low-balance,
  fee-only; arbitrators are a real multisig (Squads).
- **AC:** No private key in repo, env files, or `/tmp`; key handling documented.

### C-064 · Mainnet RPC with failover + rate budget
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** mainnet, infra
- Helius mainnet primary + a second provider; respect plan limits.
- **AC:** RPC failover verified; 429s handled with backoff.

### C-065 · init_config on mainnet (arbitrators, fee, windows)
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** mainnet, onchain
- **AC:** Config account initialized with production arbitrators + fee bps +
  challenge window bounds.

### C-066 · Fee vault + treasury setup
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** mainnet, onchain
- **AC:** Fee vault ATA created; a test settlement accrues fee to it.

### C-067 · Mainnet smoke test (tiny real job end-to-end)
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** mainnet, test, blocker
- Post → accept → deliver → finalize with $0.50 real USDC on mainnet.
- **AC:** Full lifecycle confirmed on mainnet Explorer; funds moved correctly.

### C-068 · Migrate DB to production tier + backups
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** mainnet, infra
- Neon paid tier (or equivalent), automated backups, connection pooling
  sized for prod; reduce polling intervals to protect transfer budget.
- **AC:** Backup/restore tested; settlement page polling ≥30s; no quota risk.

### C-069 · Vercel production env + domains + secrets
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** mainnet, infra
- **AC:** All prod env vars set; preview vs prod separated; no secret leakage.

### C-070 · Rollback + incident runbook for mainnet
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** mainnet, docs, infra
- **AC:** `docs/RUNBOOK.md` covers pause, rollback, key compromise, RPC outage.

### C-071 · Mainnet/devnet visual + functional separation
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** mainnet, frontend
- Clear UI banner on devnet; mainnet uses real funds warning on first action.
- **AC:** A user always knows which network they're transacting on.

---

# MILESTONE 5 — Covenant Credit (factoring) on-chain reality

### C-080 · Real `list_claim` from the credit UI
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** onchain, frontend
- **AC:** Listing a pending claim creates the real ClaimListing PDA on-chain.

### C-081 · Real `buy_claim` with USDC transfer to seller
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** onchain, backend
- **AC:** Buyer's USDC reaches seller; buyer inherits the right to face value.

### C-082 · Real `cancel_claim` + rent refund
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** onchain, frontend
- **AC:** Only an unsold listing can be cancelled; rent refunded to seller.

### C-083 · Finalize routes proceeds to buyer when claim sold
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** onchain, backend
- **AC:** End-to-end: list → buy → finalize pays the buyer, reputation stays
  with the original taker.

### C-084 · Slippage / price-change guard on buy (server + client)
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** onchain, frontend, security
- **AC:** Buyer cannot be front-run into overpaying; price re-checked on-chain.

### C-085 · Credit market unit + integration tests
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** onchain, test
- **AC:** All three instructions covered incl. dispute-loss-after-buy path.

---

# MILESTONE 6 — Security & secrets

### C-090 · Full secret sweep (history + current)
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** security, blocker
- Scan git history for leaked keys/tokens; rotate anything exposed.
- **AC:** No live secret in repo or history; rotation log kept.

### C-091 · Server-side auth on all mutating endpoints
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** security, backend
- **AC:** Every mutating route requires a verified wallet signature or API key.

### C-092 · Rate limiting + abuse protection review
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** security, backend
- **AC:** All sensitive endpoints rate-limited; load test shows no bypass.

### C-093 · SSRF / input validation on agent registration + webhooks
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** security, backend
- **AC:** Zod-validated inputs; SSRF guard tested against internal ranges.

### C-094 · Webhook signature hardening (HMAC + timestamp window)
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** security, backend
- **AC:** Replays and stale timestamps rejected; secret rotation supported.

### C-095 · Admin endpoint fail-closed + audit log
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** security, backend
- **AC:** Admin routes deny by default; every admin action logged.

### C-096 · Dependency + container vulnerability scan in CI
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** security, infra
- **AC:** CI runs `npm audit`/SCA; criticals block merge.

### C-097 · Penetration test pass on staging
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** security, test
- **AC:** Pentest findings triaged; criticals fixed pre-mainnet.

---

# MILESTONE 7 — Legal: Terms of Use, Privacy, disclosures

### C-100 · Draft Terms of Use
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** legal, blocker
- Cover: non-custodial nature, no withdrawal after escrow lock, dispute
  process + multisig role, expiry/reclaim, pseudonymity, prohibited uses,
  X/Solana ToS compliance, "as-is" software, jurisdiction, arbitration.
- **AC:** `/terms` page live; counsel-reviewed; linked in footer + first action.

### C-101 · Draft Privacy Policy
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** legal
- Data collected (wallet, chat, analytics), retention, third parties
  (Helius, Neon, Anthropic, fal.ai), cookies.
- **AC:** `/privacy` page live; linked in footer.

### C-102 · Risk + financial disclosures
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** legal
- Crypto risk, no investment advice, devnet vs mainnet funds, irreversibility.
- **AC:** Disclosure shown before any mainnet fund action.

### C-103 · Acceptable Use Policy + content moderation
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** legal, backend
- Prohibited job/agent categories; moderation + takedown flow.
- **AC:** AUP page + an enforceable moderation hook on job creation.

### C-104 · Click-through ToS acceptance (versioned)
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** legal, frontend
- First connect requires accepting the current ToS version; store consent.
- **AC:** Consent recorded with ToS version + timestamp per wallet.

### C-105 · Geographic / sanctions screening stance
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** legal, security
- Document the position; add OFAC-list wallet screening at the app layer.
- **AC:** Screening hook documented + implemented at on-ramp/UI layer.

### C-106 · Cookie + analytics consent banner (if EU traffic)
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** legal, frontend
- **AC:** Consent banner; analytics gated on consent.

### C-107 · License + open-source compliance
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** legal, docs
- **AC:** LICENSE finalized; third-party licenses inventoried.

---

# MILESTONE 8 — Observability, ops, reliability

### C-110 · Structured logging with request IDs across all routes
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** infra, backend
- **AC:** Every request correlatable; on-chain tx sigs logged.

### C-111 · Metrics: settlement volume, dispute rate, fee accrual, RPC health
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** infra
- **AC:** `/api/metrics` exposes real counters; dashboard wired.

### C-112 · Alerting (crank failures, RPC down, DB quota, dispute spike)
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** infra
- **AC:** Alerts fire to a channel; tested by inducing each condition.

### C-113 · Health checks (DB, RPC, program reachable, crank liveness)
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** infra
- **AC:** `/api/health` reflects real subsystem status.

### C-114 · Error budget + uptime SLO doc
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** infra, docs
- **AC:** SLO defined; dashboard tracks it.

### C-115 · DB transfer-cost guardrails (polling, caching, indexes)
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** infra, backend
- **AC:** Settlement/home polling ≥30s; hot queries cached + indexed; the
  Neon quota incident cannot recur silently (alert before limit).

---

# MILESTONE 9 — SDK + MCP production readiness

### C-120 · SDK: real mainnet program ID + cluster switch
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** sdk, mainnet
- **AC:** `covenant-sdk` works against mainnet with one config change.

### C-121 · SDK: end-to-end example against devnet then mainnet
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** sdk, docs, test
- **AC:** Runnable example posts + settles a job; CI runs it on devnet.

### C-122 · SDK: typed errors + retry/backoff for RPC
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** sdk
- **AC:** SDK surfaces typed lifecycle errors; flaky RPC retried.

### C-123 · MCP: write surface (create_escrow, accept, deliver, release, factor)
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** mcp, onchain
- Gated behind `COVENANT_AGENT_KEYPAIR`; the agent is its own wallet.
- **AC:** An MCP-driven agent posts + settles a real devnet job unattended.

### C-124 · MCP: human-in-the-loop signing (elicitation / unsigned tx)
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** mcp
- **AC:** A keyless client can post a job by signing in their own wallet.

### C-125 · MCP: publish to npm + MCP registry + Smithery
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** mcp, docs
- **AC:** `covenant-mcp` installable via npx; listed on registry + Smithery.

### C-126 · MCP: integration test against the live API
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** mcp, test
- **AC:** Each tool tested against a running devnet deployment in CI.

---

# MILESTONE 10 — QA, E2E, load, and FINAL COMPLETION TESTS

> The "project is done" gate. Everything below must be green before launch.

### C-130 · E2E: full human job lifecycle (Playwright, real devnet)
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** test, e2e, blocker
- Post → accept → deliver → challenge → auto-finalize, real wallet signing.
- **AC:** Playwright run green against devnet; artifacts (video/trace) saved.

### C-131 · E2E: dispute path resolved by multisig
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** test, e2e
- **AC:** Dispute raised + resolved on-chain; funds land per outcome.

### C-132 · E2E: Covenant Credit list → buy → settle to buyer
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** test, e2e
- **AC:** Buyer receives face value at finalize.

### C-133 · E2E: x402 paid chat with real payment
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** test, e2e, x402
- **AC:** Unpaid request 402s; paid request serves once; replay rejected.

### C-134 · E2E: agent-to-agent settlement via MCP (autonomous)
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** test, e2e, mcp
- **AC:** Two keypair'd agents complete a full paid loop unattended on devnet.

### C-135 · Load test: 1k concurrent job posts + settlements
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** test, infra
- **AC:** p95 latency + RPC/DB hold; no fund-state corruption under load.

### C-136 · Chaos test: RPC outage, DB blip, crank crash mid-settle
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** test, infra
- **AC:** No double-pay, no stuck escrow; reconciler heals state.

### C-137 · Reconciliation test: on-chain vs DB drift heals
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** test, backend
- **AC:** Injected drift auto-corrects; alert fires.

### C-138 · Accessibility + responsive pass (settlement + core flows)
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** frontend, test
- **AC:** Keyboard nav, contrast, mobile layouts verified on key pages.

### C-139 · Security regression suite (the M2/M6 exploits stay closed)
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** security, test
- **AC:** Old x402 bypasses + auth gaps have permanent failing-if-reopened tests.

### C-140 · Mainnet final acceptance test (real funds, tiny amounts)
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** test, mainnet, blocker
- Run C-130..C-134 equivalents on mainnet with minimal real USDC.
- **AC:** Every core flow proven on mainnet; report attached.

### C-141 · Performance budget + Lighthouse on public pages
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** frontend, test
- **AC:** Public pages meet a set performance budget.

### C-142 · Docs completeness: SDK, MCP, API, runbook, state machine
- **Owner:** @kh0ra · **Reviewer:** @mehmet · **Labels:** docs
- **AC:** A new dev can integrate from docs alone; links verified.

---

# MILESTONE 11 — Launch

### C-150 · Pre-launch checklist sign-off (both owners)
- **Owner:** @kh0ra + @mehmet · **Labels:** blocker
- **AC:** Audit closed, mainnet smoke + acceptance green, ToS/Privacy live,
  secrets rotated, monitoring + alerting on, rollback rehearsed.

### C-151 · Public launch comms (X thread, README, changelog)
- **Owner:** @mehmet · **Reviewer:** @kh0ra · **Labels:** docs
- **AC:** Launch post + updated README + tagged release published.

### C-152 · Post-launch monitoring window + on-call
- **Owner:** @kh0ra + @mehmet · **Labels:** infra
- **AC:** 72h heightened monitoring; on-call rota; incident template ready.

---

## Summary

| Milestone | Theme | Issues | Gate |
|---|---|---|---|
| M0 | Truth-in-state, kill fakes | C-001..C-008 | honest baseline |
| M1 | Real on-chain lifecycle | C-010..C-025 | escrow really moves USDC |
| M2 | Real x402 | C-030..C-039 | payments verified, replay-proof |
| M3 | Program hardening + audit | C-040..C-050 | audit C/H closed |
| M4 | Mainnet migration | C-060..C-071 | live on mainnet |
| M5 | Credit on-chain | C-080..C-085 | factoring real |
| M6 | Security & secrets | C-090..C-097 | pentest clean |
| M7 | Legal (ToS/Privacy) | C-100..C-107 | terms live + consented |
| M8 | Observability/ops | C-110..C-115 | monitored + alerted |
| M9 | SDK + MCP prod | C-120..C-126 | published + tested |
| M10 | QA / E2E / final tests | C-130..C-142 | all green |
| M11 | Launch | C-150..C-152 | signed off |

**Total: 112 issues.** Hard blockers for mainnet: C-002, C-004, C-011,
C-014, C-017, C-030, C-031, C-048, C-049, C-062, C-063, C-067, C-100,
C-130, C-140, C-150.
