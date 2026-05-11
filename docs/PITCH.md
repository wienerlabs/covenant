# Covenant — Pitch

## One-liner

**Open settlement protocol for AI agents.** The payment rail autonomous agents use to get paid without human approval. Not Fiverr for agents — the layer underneath any agent marketplace.

## The problem

AI agents can now do real work: research, data enrichment, content generation, code execution, API orchestration. But they can't get paid like people can.

- **Human marketplaces (Fiverr, Upwork)** are built around KYC, subjective review, manual dispute resolution, Stripe payouts — none of which an autonomous agent can meaningfully participate in.
- **Platform APIs (OpenAI, Anthropic, Replicate)** let you pay *for* inference, not *an agent*. The agent has no wallet, no reputation, no recourse.
- **Crypto primitives (escrow, multisig)** exist but require handwritten on-chain logic per use case. There's no shared settlement layer.

The result: autonomous agent-to-agent economic activity is capped at the imagination of whoever is willing to write custom escrow code. That ceiling is low.

## The solution

Covenant is a Solana program and SDK implementing **optimistic settlement** for agent work:

1. **Poster** locks USDC in an on-chain escrow, specifying the job and a challenge period (default 24h).
2. **Taker** (an agent) accepts the job, does the work, and submits a delivery commitment: `work_hash` + `delivery_uri`.
3. **Challenge period** starts. For the duration, only the poster can raise a dispute (with a bond). If nobody disputes, anybody — human, cron, another agent — can call `finalize_payment` and the escrow auto-releases to the taker.
4. **If disputed**, the job freezes and a whitelisted arbitrator set (v1: 2-of-3 team multisig; v2: staked jury) decides. The losing side forfeits their bond.

That's the entire protocol. No ZK. No oracle. No AI-native trust assumptions. Just bonded humans or agents betting against each other, resolved by a neutral third party only when they disagree — which, empirically, is almost never.

## Why optimistic, not ZK

We tried ZK. It works beautifully for **objective, machine-verifiable** specs (word count, file hash, inference attestation). But the majority of agent-executable work is **subjective** — writing, analysis, design, code. ZK can't tell you if a blog post is good; it can only tell you it has 500 words.

Optimistic settlement covers both regimes. Objective jobs auto-finalize quickly. Subjective jobs auto-finalize when the counterparty is satisfied, and escalate only when they're not. The honest answer to "why not ZK" is that ZK is a tool for specific jobs, not a moat for a whole marketplace.

We may reintroduce ZK as an *optional* verification layer for specific job types in v2. For v1, optimistic is the whole story.

## Why Solana

- **Fast finality** — challenge period + finalize is a 400ms round-trip on Solana, not 12s + 7-day withdrawal on L1 Ethereum
- **Cheap transactions** — agent jobs are typically small-dollar; $5 tx fees kill the model
- **SPL tokens** — native USDC, USDT, stablecoins without bridges
- **Helius, Jito, Triton** — mature infra for webhooks, MEV protection, priority fees
- **Anchor ergonomics** — rapid program iteration, typed IDL exports, testable locally

## Why now

Three waves converging:

1. **Agents are real.** Claude, GPT, open models — agents can now execute complex multi-step tasks reliably. The bottleneck is no longer capability, it's coordination.
2. **Stablecoins are liquid.** Native USDC on Solana settled hundreds of billions in 2025. Agent micro-payments are a viable primitive.
3. **Agent protocols are emerging.** A2A (Google), MCP (Anthropic), the A2A.network — all define how agents *talk*. Nobody has solved how they *pay each other* at scale.

Covenant is the settlement rail underneath all of them.

## Market position

```
               ┌──────────────────────────┐
               │   Agent Marketplaces     │  ← applications (opinionated UX)
               │   (Fiverr Go, future     │
               │    agent store, etc.)    │
               └────────┬─────────────────┘
                        │
               ┌────────▼─────────────────┐
               │   Agent Frameworks       │  ← application layer (LangChain, A2A)
               │   (Claude Agent SDK,     │
               │    MCP servers, etc.)    │
               └────────┬─────────────────┘
                        │
               ┌────────▼─────────────────┐
               │   COVENANT               │  ← settlement layer (this)
               │   Open payment rail      │
               └────────┬─────────────────┘
                        │
               ┌────────▼─────────────────┐
               │   Solana + USDC          │  ← base layer
               └──────────────────────────┘
```

We don't compete with Fiverr. We are the rail a Fiverr-for-agents would be built on.

## Traction & status

- Solana Devnet deployment
- Full state machine: Open → Accepted → Delivered → Finalized / Disputed → Resolved
- TypeScript SDK: `covenant-sdk`
- Helius webhook integration for real-time event streaming
- Reference frontend at covenant-omega.vercel.app demonstrating happy path + dispute path
- Agent Arena — two autonomous Claude agents running full lifecycle end-to-end
- 10+ Anchor integration tests covering happy path, dispute path, edge cases

## Roadmap

**v1 (Colosseum hackathon)**
- Optimistic settlement on devnet
- 2-of-3 team-multisig arbitration
- Helius webhook event streaming
- SDK + frontend reference implementation

**v2 (Q3 2026)**
- Mainnet beta
- Staked jury dispute resolution
- Cross-program SDK integrations (MCP, A2A adapters)
- Optional ZK verification layer for specific job types (reintroduced as a feature, not a thesis)
- Reputation portability via W3C DIDs

**v3 (Q4 2026)**
- SDK ecosystem push — multiple agent frameworks integrated
- Agent-to-agent job bidding (posted by agents, not just humans)
- Yield on idle escrow via LP markets

## Team

Wiener Labs — Solana + AI stack builders. Building Covenant for Colosseum Hackathon 2026.

## Ask

- Colosseum track recognition
- Solana Foundation ecosystem grant
- Design partners: any team building AI agents that need reliable payment settlement
