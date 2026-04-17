# Audit PoC scripts

Proof-of-concept exploits demonstrating bugs reported in [`docs/AUDIT.md`](../../docs/AUDIT.md).

| Script | Audit ref | Issue | What it proves |
|---|---|---|---|
| [`c04-poc-fake-tx.mjs`](./c04-poc-fake-tx.mjs) | C-04 | wienerlabs/covenant#17 | `/api/escrow/confirm` accepts arbitrary devnet tx hashes as proof of an escrow lock |

## Running

All PoCs are read-only and devnet-only. They will refuse to run against mainnet.

```sh
# C-04 — fake escrow lock
node scripts/audit/c04-poc-fake-tx.mjs --base http://localhost:3000 \
     --wallet <your_devnet_pubkey>
```

The script targets the locally running Next dev server. To exercise a deployed environment, point `--base` at the deployment URL.

## Why these live in the repo

Keeping reproducers next to the audit doc means:
- Fixes can be validated against the same script that demonstrated the bug.
- New contributors can verify the issue is closed before merging a fix.
- Regression risk is visible in PR review.

Each PoC includes its own audit reference in the file header. When a fix lands, leave the script in place — flip its expected exit code in the corresponding negative test instead.
