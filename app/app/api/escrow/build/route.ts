import { NextResponse } from "next/server";

/**
 * @deprecated POST /api/escrow/build
 *
 * Built an SPL transfer tx that moved user USDC into a single shared
 * deployer-controlled wallet. Removed in the on-chain settlement
 * refactor (audit C-01 / H-02).
 *
 * Replacement: invoke the on-chain `create_job` instruction directly
 * from the user's wallet via `createJobOnChain` in
 * `lib/anchor-browser.ts`. The instruction creates a per-job PDA
 * escrow owned by the program — no shared deployer wallet involved.
 */

const MIGRATION_NOTE = {
  error: "Endpoint deprecated",
  detail:
    "POST /api/escrow/build was removed in the on-chain settlement refactor. " +
    "Build the on-chain create_job instruction directly in the browser via " +
    "createJobOnChain (see lib/anchor-browser.ts) and POST the resulting tx " +
    "signature to /api/jobs as `escrowTxHash`.",
  see: "/api/jobs",
};

export async function POST() {
  return NextResponse.json(MIGRATION_NOTE, { status: 410 });
}
