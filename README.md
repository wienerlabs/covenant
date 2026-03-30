# COVENANT

Cryptographic escrow for agent-to-agent work on Solana. Pay only when the job is provably done.

COVENANT locks USDC in an on-chain escrow. The taker completes the work and submits a zero-knowledge proof that the deliverable meets the spec. The Solana program verifies the proof and releases payment automatically. No intermediary. No trust.

```
POSTER                          TAKER
  |                               |
  |-- lock USDC in escrow ------->|
  |                               |-- accept job
  |                               |-- complete work
  |                               |-- generate ZK proof
  |                               |-- submit proof on-chain
  |                               |
  |<-- payment auto-released -----|
  |        (verified by SP1)      |
```

---

## Architecture

```
covenant/
├── programs/covenant/       Anchor program (Solana on-chain logic)
├── circuits/word_count/     SP1 zkVM circuit (word count proof)
├── sdk/                     TypeScript SDK wrapping all interactions
├── app/                     Next.js 14 frontend
└── tests/                   Anchor integration tests
```

### On-Chain Program

Solana program built with **Anchor 0.30.1**. Four instructions:

| Instruction | Signer | What it does |
|---|---|---|
| `create_job` | Poster | Locks USDC into a PDA escrow. Sets spec hash, deadline, min word count. |
| `accept_job` | Taker | Claims an open job. Verifies spec hash matches what poster committed. |
| `submit_completion` | Taker | Submits a Groth16 proof (SP1). On-chain verifier checks it. Payment releases to taker. |
| `cancel_job` | Poster | Reclaims escrowed funds (when conditions are met). |

**State accounts:**

- `JobEscrow` -- poster, taker, amount, spec_hash, status, deadline, bump
- `AgentReputation` -- address, jobs_completed, jobs_failed, total_earned

**Status lifecycle:**

```
Open --> Accepted --> Completed
  |
  +--> Cancelled
```

### ZK Circuit

**SP1 zkVM** (Succinct) compiles a standard Rust program into a provable RISC-V execution trace.

The word-count circuit proves:

1. The taker possesses a text `T` whose SHA-256 hash matches the committed `text_hash`
2. `T` contains at least `min_words` words

The text itself is never revealed on-chain -- only the hash and word count threshold are public inputs. The proof is verified on Solana using `sp1-solana` (Groth16 over BN254).

```
Private input:  text (String)
Public inputs:  min_words (u32), text_hash ([u8; 32])

Circuit logic:
  1. sha256(text) == text_hash        // bind proof to specific text
  2. count_words(text) >= min_words   // verify minimum threshold
  3. commit(min_words, text_hash)     // expose public inputs to verifier
```

### TypeScript SDK

`CovenantSDK` class with methods:

```typescript
createJob(poster, spec, amountUsdc, posterTokenAccount, tokenMint)
acceptJob(taker, jobPda, spec)
submitCompletion(taker, jobPda, outputText, minWords, takerTA, escrowTA)
cancelJob(signer, jobPda)
fetchJob(jobPda)
fetchReputation(address)
```

`submitCompletion` calls `generateWordCountProof()` internally -- it shells out to the SP1 prover binary, generates the ZK proof, then submits it on-chain.

### Frontend

Next.js 14 App Router with TypeScript and Tailwind. IBM Plex Mono monospace design system.

- `/` -- Landing page with animated ASCII art
- `/poster` -- Create jobs, view active escrows
- `/taker` -- Browse open jobs, submit work with ZK proofs
- Wallet adapter integration (Phantom, Solflare, etc.)

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Rust | 1.84+ (stable) | `rustup install stable` |
| Solana CLI | 3.0+ | [solana.com/docs](https://docs.solanalabs.com/cli/install) |
| Anchor CLI | 0.32.1 via avm | `avm use 0.32.1` |
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| Yarn | 1.x | `npm install -g yarn` |
| SP1 | 6.0.2 | `curl -L https://sp1up.dev \| bash && sp1up` |

**Important:** The Anchor program uses `rust-toolchain.toml` pinned to Rust 1.84.0 for SBF/IDL compatibility. The ZK circuit uses `nightly` for SP1 SDK. Each crate picks up its own toolchain automatically.

**AVM setup:** The project requires `anchor-cli 0.32.1` via avm (not the cargo-installed 0.30.1):

```bash
avm use 0.32.1
export PATH="$HOME/.avm/bin:$PATH"  # add to your shell profile
```

---

## Quick Start

```bash
# Clone
git clone https://github.com/wienerlabs/covenant.git
cd covenant

# Install JS dependencies
yarn install
cd app && yarn install && cd ..
cd sdk && yarn install && cd ..

# Build the Solana program
anchor build

# Run tests (starts local validator automatically)
anchor test

# Start the frontend
cd app && yarn dev
# Open http://localhost:3000
```

## Build the ZK Circuit

```bash
# Build the SP1 program (compiles to RISC-V ELF)
cd circuits/word_count
cargo prove build

# Run circuit tests (mock prover -- fast)
cd script
SP1_PROVER=mock cargo run --release
```

Expected output:

```
=== Test 1: 600 words, min_words=500 (should pass) ===
PASS: 600-word execution succeeded. Cycles: 237583

=== Test 2: 100 words, min_words=500 (should fail) ===
PASS: 100-word execution correctly failed

=== All circuit tests passed ===
```

---

## Tests

7 integration tests covering the full escrow lifecycle:

```
  covenant
    ✔ poster can create a job and USDC is locked in escrow
    ✔ taker can accept an open job
    ✔ taker cannot accept with wrong spec hash
    ✔ taker cannot accept an already accepted job
    ✔ submit_completion fails with invalid proof
    ✔ submit_completion fails when job is not Accepted
    ✔ cancels a job

  7 passing
```

Run with:

```bash
anchor test
```

---

## Project Structure

```
programs/covenant/src/
├── lib.rs                       Program entrypoint, instruction dispatch
├── state.rs                     JobEscrow, AgentReputation, JobStatus
├── errors.rs                    CovError enum (6 variants)
└── instructions/
    ├── create_job.rs            Lock USDC, init escrow PDA
    ├── accept_job.rs            Claim job, verify spec hash
    ├── submit_completion.rs     Verify SP1 proof, release payment
    └── cancel_job.rs            Reclaim funds (stub)

circuits/word_count/
├── src/main.rs                  SP1 guest program (runs in zkVM)
└── script/src/main.rs           Host-side prover + test runner

sdk/src/
├── types.ts                     JobSpec, JobEscrowAccount, AgentReputationAccount
├── escrow.ts                    CovenantSDK class
├── prover.ts                    generateWordCountProof()
└── index.ts                     Re-exports

app/
├── app/                         Next.js pages (landing, poster, taker)
├── components/                  UI components (JobCard, AsciiAnimation, etc.)
├── hooks/                       React hooks (useJobList, useReputation)
└── lib/                         Constants, formatters

tests/
└── covenant.ts                  Anchor integration tests
```

---

## How It Works

### 1. Poster creates a job

Poster defines a `JobSpec` (min word count, deadline, language) and locks USDC into an escrow PDA. The spec is hashed (SHA-256) and stored on-chain. The actual spec text is shared off-chain.

### 2. Taker accepts

Taker reads the spec off-chain, computes the spec hash, and calls `accept_job`. The program verifies the hash matches what the poster committed -- ensuring both parties agree on the same spec.

### 3. Taker completes and proves

Taker writes the deliverable, then generates a ZK proof using the SP1 circuit:

- The proof binds to the specific text via SHA-256
- It proves the text has at least N words
- The text itself is never revealed on-chain

### 4. Payment releases

`submit_completion` calls `sp1_solana::verify_proof()` on-chain. If the Groth16 proof verifies, the escrowed USDC transfers to the taker automatically. No human arbiter needed.

---

## On-Chain Verification

The program uses `sp1-solana v0.1.0` for Groth16 proof verification on Solana. The verification key hash (`WORD_COUNT_VKEY_HASH`) in `submit_completion.rs` must be set to the actual vkey hash from `vk.bytes32()` after generating the SP1 proving key for production.

Verification consumes ~280K compute units. Transactions calling `submit_completion` should include a `SetComputeUnitLimit` instruction:

```typescript
const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
  units: 400_000,
});
```

---

## Dependencies

### On-Chain (Rust)

| Crate | Version | Purpose |
|---|---|---|
| `anchor-lang` | 0.30.1 | Solana program framework |
| `anchor-spl` | 0.30.1 | SPL token CPI helpers |
| `sp1-solana` | 0.1.0 | Groth16 proof verification |

### ZK Circuit (Rust)

| Crate | Version | Purpose |
|---|---|---|
| `sp1-zkvm` | 6.0.2 | SP1 guest runtime |
| `sp1-sdk` | 6.0.2 | Host-side prover |
| `sha2` | 0.10 | SHA-256 inside circuit |

### Frontend (TypeScript)

| Package | Purpose |
|---|---|
| `next` 14 | React framework |
| `@coral-xyz/anchor` | Solana program client |
| `@solana/wallet-adapter-*` | Wallet connection |
| `tailwindcss` | Styling |

---

## Network

Currently targeting **Solana Devnet**. The program ID is:

```
9xRCMLZxk7ahcKJ8auFboQjuzp3XxfkYVKEmTDoAnU2E
```

---

## License

See [LICENSE](./LICENSE).
