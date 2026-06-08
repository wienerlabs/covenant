# Account validation / ownership constraints audit (C-042)

Review of every instruction's account constraints (`has_one`, `signer`, `mint`,
`address`, `token::authority`, custom `constraint =`) and the negative test that
proves a wrong account is rejected.

> **Harness note.** The negative tests live in `tests/covenant.ts` (Anchor +
> ts-mocha, localnet). They are **not runnable with the default local toolchain**
> right now: `anchor build` fails because the installed CLI is **0.32.1** while
> the program pins **anchor-lang 0.30.1** (`programs/covenant/Cargo.toml`).
> Running/extending them needs `avm use 0.30.1` + a root test `package.json`
> (ts-mocha/chai/@coral-xyz/anchor) + a local validator. This audit is the
> *review* half of C-042; the gaps below are the remaining test additions to
> make once that harness is set up.

## Coverage matrix

| Instruction | Key constraints | Negative test | Status |
|-------------|-----------------|---------------|--------|
| `init_config` | config PDA init, payer signer | — | gap (low risk) |
| `update_arbitrators` | `has_one = authority`, authority signer | — | **gap** |
| `create_job` | poster signer, `token::mint = USDC`, escrow PDA derivation, poster ATA owner | — | **gap** |
| `accept_job` | taker signer, spec_hash match | `covenant.ts:538` (spec_hash mismatch) | ✓ |
| `submit_work` | taker signer == registered taker | `covenant.ts:563` (non-taker signer) | ✓ |
| `finalize_payment` | escrow `token::authority` = JobEscrow PDA, taker ATA, reputation PDA, claim routing | — | **gap** (constraint-rejection) |
| `raise_dispute` | bond `token::mint` == escrow mint, challenger signer | `covenant.ts:822` (bond mint mismatch, H-01) | ✓ |
| `resolve_dispute` | arbitrator in whitelist, no double-approve, beneficiary routing | `covenant.ts:598` (double-approve), `:712` (non-arbitrator) | ✓ |
| `cancel_job` | poster/taker authority, escrow refund, account close | `covenant.ts:791` (double-cancel) | ✓ |
| `list_claim` | taker-only, price < face_value | `covenant.ts:1067` (non-taker), `:1043` (price ≥ face) | ✓ |
| `buy_claim` | buyer != seller, USDC transfer to seller | `covenant.ts:1134` (buyer == seller) | ✓ |
| `cancel_claim` | seller-only, status guard | `covenant.ts:1201` (after bought) | ✓ |

**Result:** 8 of 12 instructions have at least one negative test proving a wrong
account / wrong state is rejected. The structural constraints themselves
(reviewed in the program source) look sound — `has_one`, `signer`, `mint`, and
PDA-derivation guards are present on each instruction.

## Gaps to close (negative tests to add, once the harness builds)

1. **`create_job`** — assert rejection when:
   - the `poster_token_account` mint ≠ USDC (`token::mint` constraint),
   - the `escrow_token_account` is not the derived PDA,
   - the poster is not a signer.
2. **`finalize_payment`** — assert rejection when:
   - `taker_token_account` is not the registered taker's ATA,
   - the `escrow_token_account` authority ≠ the JobEscrow PDA,
   - a `Bought` claim is finalized to the taker instead of the buyer (the
     `it.skip` at `covenant.ts:1256` is the positive routing test; add the
     negative counterpart).
3. **`update_arbitrators`** — assert rejection when the caller ≠ config
   `authority` (`has_one = authority`).
4. **`init_config`** — assert it cannot be re-run / re-init after first call.

## Recommendation

The structural constraints are in place and the majority of instructions have
negative coverage. Closing C-042 fully requires (a) the anchor-0.30 localnet
harness, and (b) the four negative tests above. Both are best done alongside the
program **redeploy** (#236), since that work already needs the toolchain stood
up — at which point `tests/onchain/lifecycle.spec.ts` (C-004) and the full
`tests/covenant.ts` suite can be run green.
