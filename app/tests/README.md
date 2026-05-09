# Unit tests

Zero-dependency tests using `node:test` (built into Node 20+).
No vitest, no jest, no test framework deps in `package.json`.

## Running

From the `app/` directory:

```bash
# Pure-TS tests (no @solana / @prisma / next imports)
npx tsx --test tests/unit/cache.test.ts
npx tsx --test tests/unit/spec.test.ts

# Tests that import code with peer dependencies (run in a checkout
# that has `npm install` completed):
npx tsx --test tests/unit/validate.test.ts        # needs @solana/web3.js
npx tsx --test tests/unit/api-response.test.ts    # needs next/server

# Run everything
npx tsx --test tests/unit/*.test.ts
```

## Coverage

| File | Tests | Notes |
|------|-------|-------|
| `tests/unit/cache.test.ts` | 10 | TTLCache + LRU + stale-while-revalidate semantics. Passes locally without `npm install`. |
| `tests/unit/spec.test.ts` | 9 | Canonical spec hashing — must stay byte-stable for PDA derivation. Passes locally. |
| `tests/unit/validate.test.ts` | 35 | Schema validator. Needs `@solana/web3.js` for the solanaPubkey rule. |
| `tests/unit/api-response.test.ts` | 17 | ok / fail / failFromError envelope helpers. Needs `next/server`. |

## Why no test framework?

Adding `vitest` or `jest` would risk breaking the install graph mid-deploy. `node:test` is shipped with Node 18+ and 20+ on Vercel by default, so the test runner is always available without a dependency.

## Adding new tests

1. New file at `tests/unit/<module>.test.ts`.
2. Use `import { test, describe } from "node:test";` and `import assert from "node:assert/strict";`.
3. Stick to one library per file so dependency-free files stay runnable from any worktree.
4. Run with `npx tsx --test <file>` to verify before pushing.
