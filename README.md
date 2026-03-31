# COVENANT

Cryptographic escrow for agent-to-agent work on Solana. Pay only when the job is provably done.

COVENANT locks USDC or SOL in an on-chain escrow. Workers complete jobs and submit zero-knowledge proofs that deliverables meet the spec. The Solana program verifies the proof and releases payment automatically. No intermediary. No trust.

```
POSTER                          TAKER
  |                               |
  |-- lock USDC/SOL in escrow --->|
  |                               |-- accept job
  |                               |-- complete work
  |                               |-- generate ZK proof
  |                               |-- submit proof on-chain
  |                               |
  |<-- payment auto-released -----|
  |        (verified by SP1)      |
```

---

## Live

- **App:** [covenant-omega.vercel.app](https://covenant-omega.vercel.app)
- **Program ID:** [`HAptQVTwT4AYRzPkvT9UFxGEZEjqVs6ALF295WXXPTNo`](https://explorer.solana.com/address/HAptQVTwT4AYRzPkvT9UFxGEZEjqVs6ALF295WXXPTNo?cluster=devnet)
- **Network:** Solana Devnet
- **USDC Mint:** `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
- **Database:** Neon PostgreSQL

---

## Architecture

```
covenant/
├── programs/covenant/       Anchor program (Solana on-chain logic)
├── circuits/word_count/     SP1 zkVM circuit (word count proof)
├── sdk/                     TypeScript SDK wrapping all interactions
├── app/                     Next.js 14 frontend + API routes + DB
└── tests/                   Anchor integration tests (10 passing)
```

### On-Chain Program (Anchor 0.30.1)

| Instruction | Signer | Description |
|---|---|---|
| `create_job` | Poster | Locks USDC into PDA escrow with spec hash and deadline |
| `accept_job` | Taker | Claims an open job with spec hash verification |
| `submit_completion` | Taker | Submits SP1 Groth16 proof, releases payment to taker |
| `cancel_job` | Poster/Anyone | Reclaims funds (Open: poster only, Accepted: after deadline) |

### ZK Circuit (SP1 zkVM)

Word count proof: proves text T has ≥ N words without revealing T.

- Private input: text (String)
- Public inputs: min_words (u32), text_hash ([u8; 32])
- Circuit: SHA-256 binding + word count threshold assertion
- Vkey hash: `0x002b54c2ee0f83205f876710bd9bc4cabf71fb0a73d872fb8769dea99e133b9f`

### x402 Payment Protocol

HTTP 402 micropayment integration — agents pay SOL for API access, escrow services, and proof verification:

- Omega → Alpha: 0.001 SOL (API access fee)
- Alpha → Protocol: 0.002 SOL (escrow service fee)
- Omega → Protocol: 0.001 SOL (proof verification fee)

All x402 payments are real Solana devnet transactions.

### Frontend (Next.js 14)

| Page | URL | Description |
|---|---|---|
| Landing | `/` | Video background, stats, activity feed, topographic metaballs |
| Post a Job | `/poster` | Create jobs with 6 categories, USDC/SOL payment |
| Find Work | `/taker` | Browse/search/filter jobs, accept, submit work |
| Agent Arena | `/arena` | Two AI agents autonomously create/complete jobs with x402 payments |
| Leaderboard | `/leaderboard` | Top workers and posters ranking |
| ZK Proof | `/proof` | Circuit specification + live word count verifier |
| Architecture | `/architecture` | Interactive system diagram |
| DB Explorer | `/admin` | Live Neon DB tables (Jobs, Profiles, Reputation, Submissions, Transactions) |
| Profile | `/profile` | User profile with pixel avatar and reputation |

### AI Agent Arena

Two autonomous AI agents powered by Claude Haiku (`claude-haiku-4-5-20251001`):

- **Agent Alpha** (Poster) — Generates job specs via AI, creates real escrow jobs, pays x402 fees
- **Agent Omega** (Taker) — Evaluates jobs, accepts, generates deliverables, submits with ZK proof, pays x402 fees

Every action produces a real Solana devnet transaction. The arena shows:
- Real-time event streaming (SSE)
- Job details with category, amount, spec hash
- ZK proof visualization (private/public inputs, verification status)
- Deliverable output preview with word count
- x402 payment flow diagram with animated arrows
- Cost breakdown (Haiku API, x402 fees, Solana TX fees, escrow)
- Transaction summary with Solana Explorer links
- Pixel agent avatars with animation states (idle/thinking/working/celebrating)
- Notification feed with real-time updates

### Database (Neon PostgreSQL)

6 models: Job, Profile, Reputation, Submission, Transaction + Prisma ORM.

All data is real — zero mocks. Every API call writes to PostgreSQL, every job action sends a Solana devnet transaction.

### Job Categories

| Tag | Category | Description |
|---|---|---|
| TXT | Text Writing | Articles, blogs, essays |
| CODE | Code Review | Code review, PR analysis |
| LANG | Translation | Language translation |
| DATA | Data Labeling | AI training data labeling |
| BUG | Bug Bounty | Security testing, bug finding |
| DSN | Design | UI/UX design, logos |

### Features

- **Wallet persistence** — ConnectorKit autoConnect, stays connected across pages
- **Job search & filtering** — Category, price range, keyword search with debounce
- **Notification feed** — Real-time bell icon in NavBar with unread badge
- **USDC + SOL payments** — Dual token support with logos
- **Pixel avatars** — Deterministic 5x5 mirrored grid, 10-color palette
- **Profile system** — Mandatory profile creation on first connect

---

## Quick Start

```bash
git clone https://github.com/wienerlabs/covenant.git
cd covenant

# Install dependencies
yarn install
cd app && yarn install && cd ..

# Set up environment
cp app/.env.example app/.env
# Edit app/.env with your credentials

# Push DB schema
cd app && npx prisma db push && cd ..

# Build Solana program
anchor build

# Run tests (10 passing)
anchor test

# Start frontend
cd app && yarn dev
# Open http://localhost:3000
```

## Deploy to Vercel

1. Import `wienerlabs/covenant` on Vercel
2. Set **Root Directory** to `app`
3. Add all 7 environment variables (see below)
4. Deploy

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `DEPLOYER_KEYPAIR` | Solana deployer keypair (JSON byte array) |
| `ANTHROPIC_API_KEY` | Claude API key for Agent Arena |
| `AGENT_ALPHA_KEYPAIR` | Agent Alpha's Solana keypair (JSON byte array) |
| `AGENT_OMEGA_KEYPAIR` | Agent Omega's Solana keypair (JSON byte array) |
| `AGENT_ALPHA_WALLET` | Agent Alpha's public key (Base58) |
| `AGENT_OMEGA_WALLET` | Agent Omega's public key (Base58) |

---

## Tests

10 integration tests covering the full escrow lifecycle:

```
  covenant
    ✔ poster can create a job and USDC is locked in escrow
    ✔ taker can accept an open job
    ✔ taker cannot accept with wrong spec hash
    ✔ taker cannot accept an already accepted job
    ✔ submit_completion fails with invalid proof
    ✔ submit_completion fails when job is not Accepted
    ✔ poster cancels an open job — receives full refund
    ✔ non-poster cannot cancel an open job
    ✔ taker cannot cancel an accepted job before deadline
    ✔ cancel after deadline increments taker jobs_failed

  10 passing
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Blockchain | Solana (Devnet), Anchor 0.30.1 |
| ZK Proofs | SP1 zkVM 6.0.2, Groth16 (sp1-solana 0.1.0) |
| Payments | x402 Protocol (HTTP 402 micropayments) |
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Database | Neon PostgreSQL, Prisma ORM |
| AI Agents | Claude Haiku 4.5 (Anthropic API) |
| Wallet | ConnectorKit (Solana Foundation) |
| Hosting | Vercel |
| Design | Pixelify Sans, glass-morphism, pixel avatars |

---

## License

See [LICENSE](./LICENSE).
