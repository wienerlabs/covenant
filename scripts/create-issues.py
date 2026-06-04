#!/usr/bin/env python3
"""
Create the 112 Covenant roadmap issues on GitHub via `gh`.

Idempotent-ish: skips any issue whose exact title already exists.
Creates labels + milestones first. Sleeps between creates to dodge
GitHub secondary rate limits. Re-run safely to resume.

Usage:  python3 scripts/create-issues.py [--dry-run]
"""
import json
import subprocess
import sys
import time

REPO = "wienerlabs/covenant"
KH = "kh0ra"
MH = "mehmethayirli"
DRY = "--dry-run" in sys.argv

LABELS = {
    "blocker": "b60205", "onchain": "1d76db", "x402": "0e8a16",
    "mainnet": "5319e7", "security": "d93f0b", "legal": "fbca04",
    "sdk": "006b75", "mcp": "0052cc", "infra": "c5def5",
    "frontend": "bfdadc", "backend": "c2e0c6", "test": "fef2c0",
    "docs": "d4c5f9", "audit": "e99695", "cleanup": "ededed", "e2e": "f9d0c4",
}

MILESTONES = [
    "M0 Truth-in-state & teardown of fakes",
    "M1 Real on-chain job lifecycle",
    "M2 Real x402 payments",
    "M3 Anchor hardening & audit",
    "M4 Mainnet migration",
    "M5 Covenant Credit on-chain",
    "M6 Security & secrets",
    "M7 Legal: ToS & Privacy",
    "M8 Observability & ops",
    "M9 SDK & MCP production",
    "M10 QA, E2E & final tests",
    "M11 Launch",
]

# (code, title, milestone_index, owner, reviewer, [labels], description, acceptance)
I = [
 ("C-001","Inventory every simulated/mock code path",0,KH,MH,["audit","cleanup","blocker"],
  "Produce docs/SIMULATION_INVENTORY.md listing every file/function that fakes on-chain or payment behavior (marker tx, x402 fallbacks, demo custodial paths, seeded data writers).",
  "Every sendMarkerTransaction caller, every x402 accept-fallback, and every console.log-only 'tx' enumerated with file:line and a real-replacement note."),
 ("C-002","Add COVENANT_ENV + SETTLEMENT_MODE runtime flags",0,MH,KH,["infra","backend","blocker"],
  "Introduce SETTLEMENT_MODE = simulated|onchain and COVENANT_ENV = devnet|mainnet. In onchain mode any simulated path must throw, not fake.",
  "Booting with SETTLEMENT_MODE=onchain and hitting a still-faked route returns 501, never a fake success."),
 ("C-003","Quarantine sendMarkerTransaction behind the flag",0,KH,MH,["onchain","cleanup"],
  "Mark deprecated; throw if called when SETTLEMENT_MODE=onchain.",
  "Unit test asserts it throws in onchain mode."),
 ("C-004","Write the settlement contract test spec (red tests first)",0,MH,KH,["test","onchain","blocker"],
  "Author failing tests describing the real lifecycle: create_job locks USDC in escrow PDA, accept binds taker, submit records hash, finalize moves USDC, dispute path moves correctly.",
  "tests/onchain/lifecycle.spec.ts exists, currently failing, that M1 must make pass on devnet."),
 ("C-005","Document the canonical job state machine",0,KH,MH,["docs","onchain"],
  "One diagram + table: states, allowed transitions, the instruction performing each, who signs, what USDC movement happens.",
  "docs/STATE_MACHINE.md matches the Anchor program."),
 ("C-006","CI gate: block merges that reintroduce fakes in onchain mode",0,MH,KH,["infra","test"],
  "CI check that greps for banned calls in onchain-flagged routes.",
  "CI fails if a route under /api/jobs imports sendMarkerTransaction."),
 ("C-007","Reconcile escrow client libs (delete duplicates)",0,KH,MH,["cleanup"],
  "escrow.ts, client-escrow.ts, anchor-client.ts overlap. Pick the one true client, delete the rest.",
  "Exactly one client module remains; imports updated; build green."),
 ("C-008","Show settlement mode badge in the app",0,MH,KH,["frontend"],
  "Honest badge ('devnet · on-chain' / 'simulated') so demos never misrepresent behavior.",
  "Badge reads from COVENANT_ENV/SETTLEMENT_MODE."),

 ("C-010","Real create_job from the poster UI",1,KH,MH,["onchain","frontend","blocker"],
  "/poster builds + signs create_job via anchor-browser.ts, locks USDC into the job escrow ATA, then POSTs the tx for verification.",
  "Posted job shows a real escrow ATA holding USDC on Explorer; DB mirrors only after verifyTxInvokedCovenant passes."),
 ("C-011","Server-side verification of create_job tx",1,MH,KH,["onchain","backend","security","blocker"],
  "/api/jobs POST parses the tx, confirms it invoked our program, escrow holds stated amount + mint, PDA derives from [b'job', poster, spec_hash].",
  "Forged or under-funded tx rejected; DB never records unverified jobs."),
 ("C-012","Real accept_job flow",1,KH,MH,["onchain","frontend"],
  "/taker accept signs accept_job with spec_hash verification.",
  "Acceptance fails on-chain if spec_hash mismatches; UI reflects real taker binding."),
 ("C-012b","Server verification of accept_job",1,MH,KH,["onchain","backend"],
  "/api/jobs/[id]/accept mirrors only after confirming on-chain JobEscrow.taker == submitter and status == Accepted.",
  "Mismatched submitter rejected."),
 ("C-013","Real submit_work with on-chain commitment",1,KH,MH,["onchain","frontend"],
  "RFC 8785 canonical JSON + SHA-256 work_hash; submit_work records hash + delivery_uri on-chain; challenge window from the on-chain clock.",
  "challengeEndAt derived from on-chain timestamp; UI countdown matches chain."),
 ("C-014","Real finalize_payment (permissionless crank)",1,MH,KH,["onchain","backend","blocker"],
  "Replace marker-tx finalize with a real finalize_payment. Anyone cranks; program enforces payout to registered taker.",
  "After window, USDC moves escrow→taker on Explorer; double-finalize reverts."),
 ("C-015","Cron crank service for auto-release",1,MH,KH,["onchain","infra"],
  "cron/finalize runs finalize_payment on every Delivered job past its window using CRANK_KEYPAIR (fees only).",
  "A delivered job auto-settles within one cron tick after expiry; logs show the real tx."),
 ("C-016","Real raise_dispute with bonded challenge",1,KH,MH,["onchain","frontend"],
  "Poster posts a bond (escrow mint) to dispute within the window.",
  "Dispute requires a real bond transfer; bond mint constrained to escrow mint; UI shows bond locked."),
 ("C-017","Real resolve_dispute via 2-of-3 multisig",1,KH,MH,["onchain","security","blocker"],
  "Two of three arbitrators sign; program distributes escrow + bond per outcome (FavorTaker/FavorPoster/Split).",
  "Single arbitrator cannot move funds; threshold enforced; Split validated against escrow total."),
 ("C-018","Real cancel_job + refund",1,MH,KH,["onchain","backend"],
  "Poster or past-deadline taker cancels; escrow refunds on-chain.",
  "Refund tx visible on Explorer; only poster/taker can cancel."),
 ("C-019","Replace marker tx in /api/agents/hire",1,MH,KH,["onchain","backend"],
  "Hiring an agent posts a real job + escrow; the agent (bot keypair) accepts and delivers on-chain.",
  "A hire produces a real on-chain job, not a memo."),
 ("C-020","Bot agents transact with their own keypair on-chain",1,KH,MH,["onchain","backend"],
  "Arena/autonomous bot flows use program-server.ts real signers, not marker tx. Each bot is the principal.",
  "Arena run produces real accept_job/submit_work/finalize txs."),
 ("C-021","Reconcile DB mirror with on-chain as source of truth",1,MH,KH,["onchain","backend"],
  "A reconciler reads on-chain JobEscrow accounts and repairs DB drift.",
  "Corrupting a DB row is auto-healed from chain on next read."),
 ("C-022","Remove /api/escrow/confirm marker path",1,KH,MH,["onchain","cleanup"],
  "Endpoint does real verification or is deleted; no marker tx.",
  "No marker tx remains in the route."),
 ("C-023","Handle Solana failure modes in every signed flow",1,MH,KH,["onchain","backend"],
  "Blockhash expiry, insufficient SOL, ATA-not-found, simulation failure, RPC 429 each map to a clear UI error and a safe DB state.",
  "Each failure mode has a test and never half-commits the DB."),
 ("C-024","USDC ATA bootstrap helper (create-if-missing)",1,KH,MH,["onchain","frontend"],
  "First-time posters/takers may lack a USDC ATA; create it in the same flow.",
  "A wallet with no USDC ATA can complete a job without manual setup."),
 ("C-025","Compute-budget + priority fee handling",1,MH,KH,["onchain","infra"],
  "Add compute-unit limit + priority fee to lifecycle txs so they land under load.",
  "Txs confirm under simulated congestion in test."),

 ("C-030","Remove all x402 accept-anything fallbacks",2,KH,MH,["x402","security","blocker"],
  "Delete the x402:<ts>:<wallet> bypass and the 'len>10 ⇒ valid' fallback in verifyPayment.",
  "verifyPayment returns valid only after real on-chain checks; a test proves every legacy bypass now fails."),
 ("C-031","Verify payment amount, recipient, and mint on-chain",2,MH,KH,["x402","backend","blocker"],
  "Parse the SPL transfer: assert ≥ required amount of required mint (USDC) to the creator wallet.",
  "Underpayment, wrong mint, or wrong recipient all reject."),
 ("C-032","Replay protection for x402 payments",2,KH,MH,["x402","security"],
  "A tx signature can be spent once; persist consumed signatures.",
  "Re-submitting the same payment tx for a second prompt is rejected."),
 ("C-033","Conform to the x402 HTTP 402 spec (headers + scheme)",2,MH,KH,["x402","backend"],
  "Validate Payment-Required / Payment-Signature header shapes against the x402 schema; support the Solana scheme exactly.",
  "A reference x402 client can pay a Covenant agent without custom code."),
 ("C-034","Settlement window / confirmation depth for payments",2,KH,MH,["x402","onchain"],
  "Require confirmed (not processed) commitment before granting access.",
  "A dropped/forked payment tx does not grant access."),
 ("C-035","x402 facilitator integration (optional path)",2,MH,KH,["x402","backend"],
  "Support verifying via an x402 facilitator service as an alternative to direct RPC parsing, behind a flag.",
  "Facilitator path verified end-to-end in test."),
 ("C-036","Idempotent payment-gated chat",2,KH,MH,["x402","backend"],
  "A verified payment maps to exactly one served response; retries don't double-charge or double-serve.",
  "Network-retry of a paid chat returns the same response, one charge."),
 ("C-037","Creator payout accounting reconciled to chain",2,MH,KH,["x402","backend"],
  "AgentRevenue rows must correspond to real on-chain transfers.",
  "Revenue dashboard total equals sum of verified on-chain payments."),
 ("C-038","x402 error UX",2,KH,MH,["x402","frontend"],
  "Clear states: payment required, pending confirmation, verified, failed.",
  "Each state rendered; no infinite spinners."),
 ("C-039","x402 unit + integration test suite",2,MH,KH,["x402","test"],
  "Coverage for amount/mint/recipient/replay/confirmation.",
  "All x402 tests green."),

 ("C-040","Re-derive and pin all PDA seeds; document them",3,KH,MH,["onchain","audit"],
  "Document every PDA seed; ensure no collisions; tests assert derivation.",
  "Every PDA seed documented; tests assert derivation."),
 ("C-041","Arithmetic overflow / checked math audit",3,KH,MH,["onchain","audit","security"],
  "All u64 math uses checked ops; fuzz test Split amounts.",
  "No unchecked arithmetic; fuzz passes."),
 ("C-042","Account validation / ownership constraints review",3,MH,KH,["onchain","audit","security"],
  "Review every has_one/mint/authority/signer constraint.",
  "Negative tests prove wrong accounts rejected on every ix."),
 ("C-043","Reentrancy / double-spend / state-transition guards",3,KH,MH,["onchain","audit"],
  "Verify no instruction can run out of its allowed state.",
  "Tests prove illegal transitions revert."),
 ("C-044","Mandatory claim-listing routing on finalize/resolve",3,MH,KH,["onchain","audit"],
  "A sold claim cannot be bypassed by omitting the listing account.",
  "Selling a claim then finalizing pays the buyer, not the taker."),
 ("C-045","Protocol fee instruction (configurable bps, fee vault)",3,KH,MH,["onchain","mainnet"],
  "On-chain fee capture (default 20 bps) on finalize/resolve, routed to a fee vault; configurable via init_config.",
  "Fee accrues to the vault on settlement; 0-fee config works."),
 ("C-046","Upgrade authority + program governance plan",3,KH,MH,["onchain","mainnet","security"],
  "Decide multisig upgrade authority (e.g., Squads) for mainnet; document.",
  "Mainnet program upgrade authority is a multisig, not a single key."),
 ("C-047","Deterministic + verifiable builds",3,MH,KH,["onchain","audit","infra"],
  "anchor build --verifiable; publish the build hash.",
  "Reproduced build hash matches the deployed program."),
 ("C-048","Full Anchor test coverage on localnet",3,KH,MH,["onchain","test","blocker"],
  "Happy path + every revert path for all 13 instructions.",
  "anchor test green with >=90% instruction-branch coverage."),
 ("C-049","External audit engagement + fix cycle",3,KH,MH,["audit","mainnet","blocker"],
  "Engage an auditor; triage findings; fix Critical+High before mainnet.",
  "Audit report attached; all Critical/High resolved + re-tested."),
 ("C-050","Bug-bounty scope + disclosure policy",3,MH,KH,["security","docs"],
  "SECURITY.md with scope, severity, disclosure email.",
  "SECURITY.md published."),

 ("C-060","Parameterize cluster everywhere (no hardcoded devnet)",4,MH,KH,["mainnet","infra","blocker"],
  "All RPC URLs, USDC mint, program ID, explorer links read from env.",
  "Flipping COVENANT_ENV=mainnet changes every reference; no literal 'devnet' in app code."),
 ("C-061","Mainnet USDC mint + decimals constants",4,KH,MH,["mainnet","onchain"],
  "Wire mainnet USDC mint; amounts use 6 decimals correctly.",
  "Mainnet USDC wired; decimal math correct."),
 ("C-062","Deploy program to mainnet-beta",4,KH,MH,["mainnet","onchain","blocker"],
  "Deploy the audited build; record the mainnet program ID.",
  "Program live on mainnet; ID committed to config + README."),
 ("C-063","Secure deployer + crank + arbitrator keys (no /tmp)",4,KH,MH,["mainnet","security","blocker"],
  "Move keys out of /tmp; use a secrets manager; crank key low-balance, fee-only; arbitrators a real multisig.",
  "No private key in repo, env files, or /tmp; key handling documented."),
 ("C-064","Mainnet RPC with failover + rate budget",4,MH,KH,["mainnet","infra"],
  "Helius mainnet primary + a second provider; respect plan limits.",
  "RPC failover verified; 429s handled with backoff."),
 ("C-065","init_config on mainnet (arbitrators, fee, windows)",4,KH,MH,["mainnet","onchain"],
  "Initialize the config account with production arbitrators + fee bps + challenge window bounds.",
  "Config account initialized on mainnet."),
 ("C-066","Fee vault + treasury setup",4,MH,KH,["mainnet","onchain"],
  "Create fee vault ATA; verify a settlement accrues fee.",
  "A test settlement accrues fee to the vault."),
 ("C-067","Mainnet smoke test (tiny real job end-to-end)",4,KH,MH,["mainnet","test","blocker"],
  "Post → accept → deliver → finalize with $0.50 real USDC on mainnet.",
  "Full lifecycle confirmed on mainnet Explorer; funds moved correctly."),
 ("C-068","Migrate DB to production tier + backups",4,MH,KH,["mainnet","infra"],
  "Paid DB tier, automated backups, pooling sized for prod; reduce polling to protect transfer budget.",
  "Backup/restore tested; settlement/home polling >=30s; no quota risk."),
 ("C-069","Vercel production env + domains + secrets",4,KH,MH,["mainnet","infra"],
  "Set all prod env vars; separate preview vs prod; no secret leakage.",
  "Prod env complete; secrets isolated."),
 ("C-070","Rollback + incident runbook for mainnet",4,MH,KH,["mainnet","docs","infra"],
  "docs/RUNBOOK.md covers pause, rollback, key compromise, RPC outage.",
  "Runbook reviewed; each scenario has steps."),
 ("C-071","Mainnet/devnet visual + functional separation",4,KH,MH,["mainnet","frontend"],
  "Clear devnet banner; mainnet shows a real-funds warning on first action.",
  "A user always knows which network they're transacting on."),

 ("C-080","Real list_claim from the credit UI",5,KH,MH,["onchain","frontend"],
  "Listing a pending claim creates the real ClaimListing PDA on-chain.",
  "Real ClaimListing PDA created."),
 ("C-081","Real buy_claim with USDC transfer to seller",5,MH,KH,["onchain","backend"],
  "Buyer's USDC reaches seller; buyer inherits right to face value.",
  "Buyer USDC reaches seller; right transferred."),
 ("C-082","Real cancel_claim + rent refund",5,KH,MH,["onchain","frontend"],
  "Only an unsold listing can be cancelled; rent refunded.",
  "Unsold listing cancels; rent refunded to seller."),
 ("C-083","Finalize routes proceeds to buyer when claim sold",5,MH,KH,["onchain","backend"],
  "End-to-end list→buy→finalize pays the buyer; reputation stays with taker.",
  "Buyer receives face value at finalize."),
 ("C-084","Slippage / price-change guard on buy",5,KH,MH,["onchain","frontend","security"],
  "Buyer cannot be front-run into overpaying; price re-checked on-chain.",
  "Price change beyond tolerance rejects the buy."),
 ("C-085","Credit market unit + integration tests",5,MH,KH,["onchain","test"],
  "Cover all three instructions incl. dispute-loss-after-buy.",
  "All credit tests green."),

 ("C-090","Full secret sweep (history + current)",6,KH,MH,["security","blocker"],
  "Scan git history for leaked keys/tokens; rotate anything exposed.",
  "No live secret in repo or history; rotation log kept."),
 ("C-091","Server-side auth on all mutating endpoints",6,MH,KH,["security","backend"],
  "Every mutating route requires a verified wallet signature or API key.",
  "All mutating routes authenticated."),
 ("C-092","Rate limiting + abuse protection review",6,KH,MH,["security","backend"],
  "All sensitive endpoints rate-limited; load test shows no bypass.",
  "No rate-limit bypass under load."),
 ("C-093","SSRF / input validation on agent registration + webhooks",6,MH,KH,["security","backend"],
  "Zod-validated inputs; SSRF guard tested against internal ranges.",
  "SSRF guard rejects internal targets."),
 ("C-094","Webhook signature hardening (HMAC + timestamp window)",6,KH,MH,["security","backend"],
  "Replays and stale timestamps rejected; secret rotation supported.",
  "Replay + stale timestamp rejected."),
 ("C-095","Admin endpoint fail-closed + audit log",6,MH,KH,["security","backend"],
  "Admin routes deny by default; every admin action logged.",
  "Admin denies by default; actions logged."),
 ("C-096","Dependency + container vulnerability scan in CI",6,KH,MH,["security","infra"],
  "CI runs npm audit / SCA; criticals block merge.",
  "CI blocks on critical vulns."),
 ("C-097","Penetration test pass on staging",6,MH,KH,["security","test"],
  "Pentest findings triaged; criticals fixed pre-mainnet.",
  "Pentest criticals resolved."),

 ("C-100","Draft Terms of Use",7,KH,MH,["legal","blocker"],
  "Cover non-custodial nature, no withdrawal after escrow lock, dispute process + multisig role, expiry/reclaim, pseudonymity, prohibited uses, X/Solana ToS compliance, as-is software, jurisdiction, arbitration.",
  "/terms page live; counsel-reviewed; linked in footer + first action."),
 ("C-101","Draft Privacy Policy",7,MH,KH,["legal"],
  "Data collected (wallet, chat, analytics), retention, third parties (Helius, Neon, Anthropic, fal.ai), cookies.",
  "/privacy page live; linked in footer."),
 ("C-102","Risk + financial disclosures",7,KH,MH,["legal"],
  "Crypto risk, no investment advice, devnet vs mainnet funds, irreversibility.",
  "Disclosure shown before any mainnet fund action."),
 ("C-103","Acceptable Use Policy + content moderation",7,MH,KH,["legal","backend"],
  "Prohibited job/agent categories; moderation + takedown flow.",
  "AUP page + enforceable moderation hook on job creation."),
 ("C-104","Click-through ToS acceptance (versioned)",7,KH,MH,["legal","frontend"],
  "First connect requires accepting the current ToS version; store consent.",
  "Consent recorded with ToS version + timestamp per wallet."),
 ("C-105","Geographic / sanctions screening stance",7,MH,KH,["legal","security"],
  "Document the position; add OFAC-list wallet screening at the app layer.",
  "Screening hook documented + implemented."),
 ("C-106","Cookie + analytics consent banner",7,KH,MH,["legal","frontend"],
  "Consent banner; analytics gated on consent.",
  "Analytics gated on consent."),
 ("C-107","License + open-source compliance",7,MH,KH,["legal","docs"],
  "Finalize LICENSE; inventory third-party licenses.",
  "LICENSE finalized; third-party licenses inventoried."),

 ("C-110","Structured logging with request IDs across all routes",8,MH,KH,["infra","backend"],
  "Every request correlatable; on-chain tx sigs logged.",
  "Requests correlatable end to end."),
 ("C-111","Metrics: settlement volume, dispute rate, fee accrual, RPC health",8,KH,MH,["infra"],
  "Expose real counters at /api/metrics; wire a dashboard.",
  "Metrics reflect real on-chain activity."),
 ("C-112","Alerting (crank failures, RPC down, DB quota, dispute spike)",8,MH,KH,["infra"],
  "Alerts fire to a channel; tested by inducing each condition.",
  "Each alert verified by induction."),
 ("C-113","Health checks (DB, RPC, program reachable, crank liveness)",8,KH,MH,["infra"],
  "/api/health reflects real subsystem status.",
  "Health endpoint reflects real status."),
 ("C-114","Error budget + uptime SLO doc",8,MH,KH,["infra","docs"],
  "Define SLO; dashboard tracks it.",
  "SLO defined and tracked."),
 ("C-115","DB transfer-cost guardrails (polling, caching, indexes)",8,KH,MH,["infra","backend"],
  "Settlement/home polling >=30s; hot queries cached + indexed; alert before quota.",
  "The Neon quota incident cannot recur silently."),

 ("C-120","SDK: real mainnet program ID + cluster switch",9,KH,MH,["sdk","mainnet"],
  "covenant-sdk works against mainnet with one config change.",
  "SDK switches cluster via config."),
 ("C-121","SDK: end-to-end example against devnet then mainnet",9,MH,KH,["sdk","docs","test"],
  "Runnable example posts + settles a job; CI runs it on devnet.",
  "Example green in CI on devnet."),
 ("C-122","SDK: typed errors + retry/backoff for RPC",9,KH,MH,["sdk"],
  "SDK surfaces typed lifecycle errors; flaky RPC retried.",
  "Typed errors + retry verified."),
 ("C-123","MCP: write surface (create_escrow, accept, deliver, release, factor)",9,MH,KH,["mcp","onchain"],
  "Gated behind COVENANT_AGENT_KEYPAIR; the agent is its own wallet.",
  "An MCP-driven agent posts + settles a real devnet job unattended."),
 ("C-124","MCP: human-in-the-loop signing (elicitation / unsigned tx)",9,KH,MH,["mcp"],
  "A keyless client can post a job by signing in their own wallet.",
  "Keyless client completes a post via elicitation."),
 ("C-125","MCP: publish to npm + MCP registry + Smithery",9,MH,KH,["mcp","docs"],
  "covenant-mcp installable via npx; listed on registry + Smithery.",
  "Published + listed."),
 ("C-126","MCP: integration test against the live API",9,KH,MH,["mcp","test"],
  "Each tool tested against a running devnet deployment in CI.",
  "All MCP tools tested in CI."),

 ("C-130","E2E: full human job lifecycle (Playwright, real devnet)",10,MH,KH,["test","e2e","blocker"],
  "Post → accept → deliver → challenge → auto-finalize, real wallet signing.",
  "Playwright green against devnet; artifacts saved."),
 ("C-131","E2E: dispute path resolved by multisig",10,KH,MH,["test","e2e"],
  "Dispute raised + resolved on-chain; funds land per outcome.",
  "Dispute E2E green."),
 ("C-132","E2E: Covenant Credit list → buy → settle to buyer",10,MH,KH,["test","e2e"],
  "Buyer receives face value at finalize.",
  "Credit E2E green."),
 ("C-133","E2E: x402 paid chat with real payment",10,KH,MH,["test","e2e","x402"],
  "Unpaid 402s; paid serves once; replay rejected.",
  "x402 E2E green."),
 ("C-134","E2E: agent-to-agent settlement via MCP (autonomous)",10,MH,KH,["test","e2e","mcp"],
  "Two keypair'd agents complete a full paid loop unattended on devnet.",
  "Autonomous agent-to-agent loop green."),
 ("C-135","Load test: 1k concurrent job posts + settlements",10,KH,MH,["test","infra"],
  "p95 latency + RPC/DB hold; no fund-state corruption under load.",
  "Load test passes without corruption."),
 ("C-136","Chaos test: RPC outage, DB blip, crank crash mid-settle",10,MH,KH,["test","infra"],
  "No double-pay, no stuck escrow; reconciler heals state.",
  "Chaos scenarios heal cleanly."),
 ("C-137","Reconciliation test: on-chain vs DB drift heals",10,KH,MH,["test","backend"],
  "Injected drift auto-corrects; alert fires.",
  "Drift auto-corrects."),
 ("C-138","Accessibility + responsive pass (settlement + core flows)",10,MH,KH,["frontend","test"],
  "Keyboard nav, contrast, mobile layouts verified on key pages.",
  "A11y + responsive verified."),
 ("C-139","Security regression suite (M2/M6 exploits stay closed)",10,KH,MH,["security","test"],
  "Old x402 bypasses + auth gaps have permanent failing-if-reopened tests.",
  "Regression suite green."),
 ("C-140","Mainnet final acceptance test (real funds, tiny amounts)",10,KH,MH,["test","mainnet","blocker"],
  "Run C-130..C-134 equivalents on mainnet with minimal real USDC.",
  "Every core flow proven on mainnet; report attached."),
 ("C-141","Performance budget + Lighthouse on public pages",10,MH,KH,["frontend","test"],
  "Public pages meet a set performance budget.",
  "Lighthouse budget met."),
 ("C-142","Docs completeness: SDK, MCP, API, runbook, state machine",10,KH,MH,["docs"],
  "A new dev can integrate from docs alone; links verified.",
  "Docs complete and verified."),

 ("C-150","Pre-launch checklist sign-off (both owners)",11,KH,MH,["blocker"],
  "Audit closed, mainnet smoke + acceptance green, ToS/Privacy live, secrets rotated, monitoring on, rollback rehearsed.",
  "Both owners sign off."),
 ("C-151","Public launch comms (X thread, README, changelog)",11,MH,KH,["docs"],
  "Launch post + updated README + tagged release.",
  "Launch comms published."),
 ("C-152","Post-launch monitoring window + on-call",11,KH,MH,["infra"],
  "72h heightened monitoring; on-call rota; incident template ready.",
  "On-call + monitoring active for 72h."),
]


def run(args, check=True):
    return subprocess.run(args, capture_output=True, text=True, check=False)


def ensure_labels():
    for name, color in LABELS.items():
        if DRY:
            print(f"[dry] label {name}")
            continue
        run(["gh", "label", "create", name, "--repo", REPO, "--color", color, "--force"])


def ensure_milestones():
    existing = {}
    r = run(["gh", "api", f"repos/{REPO}/milestones?state=all&per_page=100"])
    if r.returncode == 0:
        try:
            for m in json.loads(r.stdout):
                existing[m["title"]] = m["number"]
        except Exception:
            pass
    numbers = {}
    for title in MILESTONES:
        if title in existing:
            numbers[title] = existing[title]
            continue
        if DRY:
            print(f"[dry] milestone {title}")
            numbers[title] = -1
            continue
        r = run(["gh", "api", f"repos/{REPO}/milestones", "-f", f"title={title}"])
        try:
            numbers[title] = json.loads(r.stdout)["number"]
        except Exception:
            print(f"  ! milestone create failed: {title}: {r.stderr[:200]}")
    return numbers


def existing_titles():
    titles = set()
    r = run(["gh", "issue", "list", "--repo", REPO, "--state", "all",
             "--limit", "500", "--json", "title"])
    if r.returncode == 0:
        try:
            for it in json.loads(r.stdout):
                titles.add(it["title"])
        except Exception:
            pass
    return titles


def main():
    print(f"Repo: {REPO}  dry={DRY}")
    ensure_labels()
    ms = ensure_milestones()
    have = existing_titles()
    created = skipped = failed = 0
    for code, title, mi, owner, reviewer, labels, desc, ac in I:
        full_title = f"{code}: {title}"
        if full_title in have:
            skipped += 1
            print(f"skip (exists): {full_title}")
            continue
        milestone = MILESTONES[mi]
        body = (
            f"**Owner:** @{owner}  ·  **Reviewer:** @{reviewer}\n"
            f"**Milestone:** {milestone}\n\n"
            f"{desc}\n\n"
            f"**Acceptance criteria**\n- {ac}\n\n"
            f"_Tracked in docs/MAINNET_ROADMAP.md ({code})._"
        )
        assignees = owner if owner == reviewer else f"{owner},{reviewer}"
        if DRY:
            print(f"[dry] {full_title}  ms={milestone}  labels={labels}  assignees={assignees}")
            created += 1
            continue
        args = ["gh", "issue", "create", "--repo", REPO,
                "--title", full_title, "--body", body,
                "--assignee", assignees, "--milestone", milestone]
        for lb in labels:
            args += ["--label", lb]
        r = run(args)
        if r.returncode == 0:
            created += 1
            print(f"created: {full_title}")
        else:
            failed += 1
            print(f"  ! FAILED {full_title}: {r.stderr[:200]}")
            # retry once after a pause (secondary rate limit)
            time.sleep(8)
            r2 = run(args)
            if r2.returncode == 0:
                created += 1
                failed -= 1
                print(f"  retried OK: {full_title}")
        time.sleep(2.5)
    print(f"\nDONE  created={created} skipped={skipped} failed={failed}")


if __name__ == "__main__":
    main()
