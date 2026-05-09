import { NextResponse } from "next/server";

/**
 * POST /api/escrow/build
 *
 * Historically built an SPL transfer tx into a deployer-controlled escrow.
 * Removed in the on-chain settlement refactor (audit C-01 / H-02), then
 * temporarily re-enabled in **demo mode** for live presentations: returns
 * a `demoMode` flag instructing the client to skip the signing step and
 * post a record-only job to /api/jobs. /api/jobs honors `demoMode: true`
 * by mirroring the row to Postgres without on-chain verification.
 *
 * For real on-chain settlement, callers should invoke `createJobOnChain`
 * (see lib/anchor-browser.ts) and post the resulting signature directly
 * as `escrowTxHash`.
 */
export async function POST() {
  return NextResponse.json(
    {
      demoMode: true,
      escrowAta: null,
      note:
        "Demo mode: client should skip signing and post job with demoMode=true. " +
        "Real on-chain escrow uses createJobOnChain (lib/anchor-browser.ts).",
    },
    { status: 200 },
  );
}
