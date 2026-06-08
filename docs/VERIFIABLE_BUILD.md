# Verifiable & deterministic builds (C-047)

**Goal:** anyone can rebuild the Covenant Anchor program from this source and
get **byte-for-byte the same binary** that is deployed on chain — so the
deployed program can be trusted to match the audited source.

- **Program:** `covenant`
- **Program ID:** `5hstj5grBUL1BeSaPLYpgkD6n3ALasmbseRvKRFfCVNT`
- **Cluster (current):** devnet — `https://api.devnet.solana.com`
- **Source:** `programs/covenant/` (`anchor-lang = 0.30.1`, see its `Cargo.toml`)

Verification is automated in CI by
[`.github/workflows/verifiable-build.yml`](../.github/workflows/verifiable-build.yml),
which reproduces the build and asserts the hash matches the on-chain program.
The job is **not** run on every PR (it is slow and Docker-bound); trigger it
from the Actions tab ("Verifiable build (C-047)" → *Run workflow*) or by pushing
a `program-v*` / `v*` tag.

## Tooling

We use [`solana-verify`](https://github.com/Ellipsis-Labs/solana-verifiable-build)
(the standard for verifiable Solana builds). It builds the program inside a
pinned Docker image so the output is deterministic regardless of host.

```bash
cargo install solana-verify --locked
```

> **Why not a committed hash constant?** A hard-coded hash in the repo rots and
> invites "just update the constant" papering-over. Instead CI recomputes both
> sides every run — the reproduced artifact hash **and** the live on-chain hash
> — and compares them. The source of truth is the chain, not a string in git.

## Reproduce locally

```bash
# 1. Build deterministically (Docker; pinned toolchain).
solana-verify build --library-name covenant

# 2. Hash the artifact you just built.
solana-verify get-executable-hash target/deploy/covenant.so

# 3. Hash the program currently deployed on devnet.
solana-verify get-program-hash -u https://api.devnet.solana.com \
  5hstj5grBUL1BeSaPLYpgkD6n3ALasmbseRvKRFfCVNT

# 4. The two hashes MUST be identical.
```

`get-program-hash` normalizes the trailing zero-padding of the on-chain
executable so it lines up with the freshly built `.so`.

## Toolchain pinning (determinism)

Determinism requires a pinned toolchain. The source pins the Anchor **library**
to `0.30.1` (`programs/covenant/Cargo.toml`). `solana-verify` additionally pins
the Solana toolchain via its Docker base image.

To pin the toolchain for plain `anchor build` as well, add to `Anchor.toml`:

```toml
[toolchain]
anchor_version = "0.30.1"   # match anchor-lang in programs/covenant/Cargo.toml
solana_version = "<the version the verified build used>"
```

> This pin is **documented, not forced**, in this PR: it is only safe to commit
> once a verifiable build has confirmed the exact `solana_version` that
> reproduces the deployed bytecode (otherwise a wrong pin breaks `anchor build`
> for everyone). The CI job records the toolchain it used in its logs; copy that
> `solana_version` here and commit the pin once the hashes match.

## If the hashes do NOT match

A mismatch means the deployed program was built from different source or a
different toolchain. To reconcile:

1. Confirm the deployed program is built from *this* commit (no local edits).
2. Confirm the Solana/Anchor versions match what produced the deployment
   (check the deploy logs or the verification PDA).
3. If the program legitimately changed, **redeploy from the verifiable build**
   so chain and source agree again, then re-run the workflow.

## Publishing the verification (optional, recommended for mainnet)

`solana-verify` can submit the verification to the public registry so explorers
show a "verified build" badge:

```bash
solana-verify verify-from-repo -u https://api.devnet.solana.com \
  --program-id 5hstj5grBUL1BeSaPLYpgkD6n3ALasmbseRvKRFfCVNT \
  https://github.com/wienerlabs/covenant
```

This step is deferred until mainnet (it writes an on-chain verification PDA);
the local + CI hash comparison above already satisfies C-047's acceptance
criterion ("reproduced build hash matches the deployed program").
