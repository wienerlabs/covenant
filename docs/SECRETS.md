# Secrets & Key Handling

> Tracking: C-063 (no keys in /tmp), C-090 (secret sweep), C-094 (webhook secrets).
> Status of the sweep at time of writing: the repo and full git history were
> scanned for committed secrets — none found. The items below are the
> standing policy that keeps it that way.

## Golden rules

1. **No secret ever enters git.** Not in code, not in config, not in history.
   The `.gitignore` blocks env files, keypairs, and credential material; the
   `secret-scan` CI job (gitleaks + a grep guard) is a hard merge gate.
2. **No secret in `/tmp`.** `/tmp` is world-traversable and ephemeral. The
   Anchor deploy wallet defaults to `~/.config/solana/id.json` (0600, per
   user). Mainnet uses a hardware wallet or a Squads multisig signer.
3. **No secret in a URL / query string.** Query params leak into access
   logs, proxies, Referer headers, and browser history. All auth is via the
   `Authorization` header, compared in constant time.
4. **Every secret comes from the environment** (Vercel project env / a
   secrets manager), loaded at runtime via `keypairFromEnv` and
   `process.env`. Never read from a committed file.

## Where each secret lives

| Secret | Purpose | Lives in | Notes |
|---|---|---|---|
| `DEPLOYER_KEYPAIR` | Program deploy / fallback crank | env (manager) | Mainnet: multisig upgrade authority |
| `CRANK_KEYPAIR` | Permissionless `finalize_payment` crank | env (manager) | Low-balance, fees only; cannot redirect funds |
| Arbitrator keys | 2-of-3 dispute multisig | individual signers / Squads | No single key can move escrow |
| `CRON_SECRET` | Vercel Cron auth | env | Sent as `Authorization: Bearer …`, header-only |
| `HELIUS_WEBHOOK_SECRET` | Inbound webhook auth | env | Header-only, constant-time, fail-closed |
| `HELIUS_RPC_URL` (+ key) | RPC | env | Not logged; rotate if exposed |
| `DATABASE_URL` / `DIRECT_URL` | Postgres | env | Rotate on any suspected exposure |
| `BLOB_READ_WRITE_TOKEN` | Delivery storage | env | |
| `ANTHROPIC_API_KEY` / `FAL_KEY` | AI generation | env | |
| Webhook signing secret(s) | Outbound webhook HMAC | env | Supports rotation (array of secrets) |

## Local development

- Solana CLI keypair at `~/.config/solana/id.json` for `anchor deploy`.
- App secrets in `app/.env` (gitignored). Copy `app/.env.example` and fill in.
- Never paste a secret into a chat, a PR description, an issue, or a commit.

## Rotation

- **Routine:** rotate `CRON_SECRET`, `HELIUS_WEBHOOK_SECRET`, and webhook
  signing secrets quarterly. The outbound signer accepts an array of
  secrets so old + new overlap during cutover.
- **On suspected exposure:** rotate immediately, then invalidate the old
  value at the source (Helius dashboard, DB password, RPC provider).
- **Crank/deployer key compromise:** see `docs/RUNBOOK.md` (pause, rotate
  upgrade authority via the multisig, redeploy).

## If a secret is committed by accident

1. Treat it as compromised the instant it is pushed — rotate it first.
2. Remove it from history (`git filter-repo` / BFG) and force-push, or if
   that is impractical, rotate and move on (rotation is what actually
   protects you; scrubbing history is hygiene).
3. The `secret-scan` CI gate should have blocked it — if it slipped through,
   add a rule so it cannot recur.

## Hardening already in place

- `.gitignore`: env files, `*-keypair.json`, `*.pem`, `*.key`, `secrets/`.
- CI `secret-scan`: gitleaks + grep guard for Solana key arrays and token
  prefixes; blocks merge.
- `Anchor.toml`: deploy wallet defaults out of `/tmp`.
- Cron + Helius webhook auth: header-only, constant-time, fail-closed.
- Outbound webhook signing: per-delivery signed id, replay-cache interface,
  `requireDeliveryId` to prevent downgrade replays, multi-secret rotation.
