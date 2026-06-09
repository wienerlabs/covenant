# Geographic / sanctions screening (C-105)

## Position

Covenant does not knowingly provide services to sanctioned parties. We enforce
this at the **wallet layer**, which is the level we can verify on-chain:

- **A wallet on the OFAC Specially Designated Nationals (SDN) list is blocked**
  from value-bearing actions (posting a job; the same hook is reusable for
  claim purchases, staking, and agent registration).
- **Geographic restrictions:** the app cannot reliably geolocate a wallet, so
  the enforceable control is sanctions-list screening rather than IP geofencing.
  For mainnet, IP-based geofencing of comprehensively-sanctioned jurisdictions
  (per the operating entity's legal advice) can be layered on at the edge
  (Vercel) without changing the wallet hook.

This is an automated first line; it does not replace the operator's own
compliance obligations.

## Screening hook (implemented)

`app/lib/sanctions.ts`:

- `screenWallet(wallet)` → `{ blocked, reason }` — call at an on-ramp action and
  reject a blocked wallet with **HTTP 403**.
- `isSanctioned(wallet)` / `sanctionsDenylist()` — the underlying check + the
  active set.

**Wired at:** `POST /api/jobs` (the poster wallet) — a sanctioned poster is
rejected before any DB or chain write. The same one-line guard wraps any other
wallet entry point.

## Denylist data — operator-loaded (no fabricated list shipped)

The denylist is the **union** of:

1. `app/lib/sanctions-list.json` (`addresses`) — **ships empty**. It must be
   populated from the authoritative OFAC feed and kept current:
   - SDN list: <https://sanctionslist.ofac.treas.gov/> (`SDN.XML` /
     `sdn_advanced.xml`), filtering the `Digital Currency Address` entries for
     Solana (`XSOL`) plus any chain-agnostic addresses that resolve to Solana.
   - The OFAC list changes; refresh on a schedule (e.g. weekly) and commit the
     updated JSON, stamping `updatedAt`.
2. `SANCTIONS_DENYLIST` env (comma-separated) — for ops to add/remove entries
   **without a deploy** (e.g. an urgent addition between refreshes).

We deliberately do **not** bundle a hand-typed address list: a stale or
mistyped entry would either miss a sanctioned wallet or wrongly block a clean
one. The hook is implemented and enforced; the data is sourced from OFAC.

## Testing

`app/tests/unit/sanctions.test.ts` drives the hook via `SANCTIONS_DENYLIST` to
prove the screening mechanism (block / allow / null-safety / env parsing) and
that the default (empty) list blocks nothing.

## Limitations / follow-ups

- Exact base58 match only (OFAC publishes exact addresses); no clustering /
  heuristic analysis.
- Mainnet: add edge geofencing + consider a chain-analysis vendor feed for
  higher recall, both behind the same `screenWallet` seam.
