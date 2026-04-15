import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Connection, PublicKey } from "@solana/web3.js";

// Always dynamic — talks to Prisma + Solana RPC per request.
// Prevents Next.js from pre-rendering this GET handler at build time,
// which would fail in CI where DATABASE_URL is unset.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/cron/reconcile
 *
 * Fallback reconciliation for cases where a Helius webhook was missed
 * (delivery failure, cold start, outage). Scans the last N transactions
 * for the Covenant program ID and ensures each one has a corresponding
 * JobEvent row in the DB; creates missing rows.
 *
 * Safe to re-run — the `JobEvent.txSignature` unique constraint makes
 * every insert idempotent.
 *
 * Schedule in vercel.json:
 *   { "crons": [{ "path": "/api/cron/reconcile", "schedule": "* /10 * * * *" }] }
 */

const CRON_SECRET = process.env.CRON_SECRET ?? "";
const PROGRAM_ID = new PublicKey(
  process.env.COVENANT_PROGRAM_ID ?? "5hstj5grBUL1BeSaPLYpgkD6n3ALasmbseRvKRFfCVNT",
);
const SCAN_LIMIT = parseInt(process.env.RECONCILE_SCAN_LIMIT ?? "500", 10);

function authorized(req: NextRequest): boolean {
  if (!CRON_SECRET) return true;
  const header = req.headers.get("authorization");
  return (
    header === `Bearer ${CRON_SECRET}` ||
    new URL(req.url).searchParams.get("auth") === CRON_SECRET
  );
}

function rpcUrl(): string {
  return (
    process.env.HELIUS_RPC_URL ||
    process.env.NEXT_PUBLIC_RPC_URL ||
    "https://api.devnet.solana.com"
  );
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connection = new Connection(rpcUrl(), "confirmed");
  let signatures: { signature: string; slot: number; blockTime?: number | null }[] = [];
  try {
    const sigs = await connection.getSignaturesForAddress(PROGRAM_ID, {
      limit: SCAN_LIMIT,
    });
    signatures = sigs.map((s) => ({
      signature: s.signature,
      slot: s.slot,
      blockTime: s.blockTime,
    }));
  } catch (err) {
    console.error("[cron/reconcile] getSignaturesForAddress failed:", err);
    return NextResponse.json(
      {
        error: "RPC call failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  // Which signatures do we already have?
  const existing = await prisma.jobEvent.findMany({
    where: {
      txSignature: { in: signatures.map((s) => s.signature) },
    },
    select: { txSignature: true },
  });
  const known = new Set(existing.map((e) => e.txSignature));
  const missing = signatures.filter((s) => !known.has(s.signature));

  let reconciled = 0;
  let failed = 0;

  for (const sig of missing) {
    try {
      const tx = await connection.getTransaction(sig.signature, {
        maxSupportedTransactionVersion: 0,
      });
      if (!tx) {
        failed++;
        continue;
      }
      const logs = tx.meta?.logMessages ?? [];

      // Best-effort type detection from logs
      let type: string | null = null;
      for (const line of logs) {
        if (line.includes("Job created:")) type = "created";
        else if (line.includes("Job accepted")) type = "accepted";
        else if (line.includes("Work submitted:")) type = "delivered";
        else if (line.includes("Payment finalized:")) type = "finalized";
        else if (line.includes("Dispute raised:")) type = "disputed";
        else if (line.includes("Dispute resolved:")) type = "resolved";
        else if (line.includes("Job cancelled:")) type = "cancelled";
        if (type) break;
      }
      if (!type) continue;

      // Find matching Job via account keys; fall back to most recent matching state
      const accountKeys = tx.transaction.message
        .getAccountKeys()
        .staticAccountKeys.map((k) => k.toBase58());
      let jobRow = await prisma.job.findFirst({
        where: { pda: { in: accountKeys } },
      });
      if (!jobRow) {
        // Fallback: most recent job matching the payer wallet
        const payer = accountKeys[0];
        jobRow = await prisma.job.findFirst({
          where: {
            OR: [{ posterWallet: payer }, { takerWallet: payer }],
          },
          orderBy: { updatedAt: "desc" },
        });
      }
      if (!jobRow) {
        failed++;
        continue;
      }

      await prisma.jobEvent.create({
        data: {
          jobId: jobRow.id,
          type,
          txSignature: sig.signature,
          slot: BigInt(sig.slot),
          blockTime: sig.blockTime ? new Date(sig.blockTime * 1000) : null,
          wallet: accountKeys[0],
          data: {
            reconciled: true,
            logs: logs.slice(0, 10),
          },
        },
      });
      reconciled++;
    } catch (err) {
      failed++;
      console.error(`[cron/reconcile] sig ${sig.signature} failed:`, err);
    }
  }

  return NextResponse.json({
    scanned: signatures.length,
    alreadyKnown: known.size,
    reconciled,
    failed,
  });
}
