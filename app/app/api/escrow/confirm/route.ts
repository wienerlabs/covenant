import { NextResponse } from "next/server";

/**
 * @deprecated POST /api/escrow/confirm
 *
 * This endpoint was the bridge between a custodial-style "lock USDC in
 * the deployer wallet" flow and the Job DB row. After the on-chain
 * settlement refactor (audit C-01 / H-02), Jobs are created via the
 * real on-chain `create_job` Anchor instruction and the canonical
 * entry point is now POST /api/jobs.
 *
 * The endpoint is kept as a 410 Gone response so existing clients fail
 * loudly with a clear migration message instead of silently doing the
 * wrong thing.
 */

const MIGRATION_NOTE = {
  error: "Endpoint deprecated",
  detail:
    "POST /api/escrow/confirm has been removed in the on-chain settlement refactor. " +
    "Use POST /api/jobs instead. For human users, the browser must invoke " +
    "the on-chain create_job instruction first (see lib/anchor-browser.ts " +
    "createJobOnChain) and pass the resulting tx signature in the request " +
    "body as `escrowTxHash`. For bot agents, the server signs with the bot's " +
    "keypair via lib/program-server.ts botCreateJob.",
  see: "/api/jobs",
};

export async function POST() {
  return NextResponse.json(MIGRATION_NOTE, { status: 410 });
}

export async function GET() {
  return NextResponse.json(MIGRATION_NOTE, { status: 410 });
}
