import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

/**
 * POST /api/helius/webhook
 *
 * Receives real-time Solana transaction push events from Helius's
 * Enhanced Webhooks service. The webhook is idempotent via the
 * unique `txSignature` constraint on JobEvent — replays are safe.
 *
 * Security: validated via a shared secret passed either in the
 * `authorization` header (when using Helius's "Auth Header" mode)
 * or in the `?auth=` query param. Set HELIUS_WEBHOOK_SECRET in env.
 *
 * Helius ships several payload schemas; we match both:
 *   1. "enhanced" (parsed) -- array of parsed objects with accountData
 *   2. "raw" -- array of raw transaction objects with meta.logMessages
 *
 * For each event we extract the instruction name from logs, find the
 * associated job, and upsert a JobEvent row. If the event triggers a
 * status transition (delivered, finalized, disputed, resolved), we
 * mirror it into the Job table as well.
 */

const HELIUS_WEBHOOK_SECRET = process.env.HELIUS_WEBHOOK_SECRET ?? "";

function verifyAuth(req: NextRequest): boolean {
  if (!HELIUS_WEBHOOK_SECRET) {
    console.warn("[helius-webhook] HELIUS_WEBHOOK_SECRET not set; accepting all");
    return true;
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader === HELIUS_WEBHOOK_SECRET) return true;
  if (authHeader === `Bearer ${HELIUS_WEBHOOK_SECRET}`) return true;
  const url = new URL(req.url);
  if (url.searchParams.get("auth") === HELIUS_WEBHOOK_SECRET) return true;
  return false;
}

interface ParsedEvent {
  type: string;
  jobPda?: string;
  wallet?: string;
  amount?: number;
  data: Record<string, unknown>;
}

function detectEventType(logs: string[]): ParsedEvent | null {
  for (const line of logs) {
    if (line.includes("Job created:")) {
      const poster = line.match(/poster=([1-9A-HJ-NP-Za-km-z]+)/)?.[1];
      const amount = line.match(/amount=(\d+)/)?.[1];
      const cp = line.match(/challenge_period=(\d+)s/)?.[1];
      return {
        type: "created",
        wallet: poster,
        amount: amount ? Number(amount) / 1e6 : undefined,
        data: { challengePeriod: cp ? Number(cp) : undefined, raw: line },
      };
    }
    if (line.includes("Job accepted by taker=")) {
      const taker = line.match(/taker=([1-9A-HJ-NP-Za-km-z]+)/)?.[1];
      return { type: "accepted", wallet: taker, data: { raw: line } };
    }
    if (line.includes("Work submitted:")) {
      const taker = line.match(/taker=([1-9A-HJ-NP-Za-km-z]+)/)?.[1];
      const challengeEnd = line.match(/challenge_end=(\d+)/)?.[1];
      return {
        type: "delivered",
        wallet: taker,
        data: { challengeEnd: challengeEnd ? Number(challengeEnd) : undefined, raw: line },
      };
    }
    if (line.includes("Payment finalized:")) {
      const taker = line.match(/taker=([1-9A-HJ-NP-Za-km-z]+)/)?.[1];
      const amount = line.match(/amount=(\d+)/)?.[1];
      const crank = line.match(/crank=([1-9A-HJ-NP-Za-km-z]+)/)?.[1];
      return {
        type: "finalized",
        wallet: crank,
        amount: amount ? Number(amount) / 1e6 : undefined,
        data: { taker, crank, raw: line },
      };
    }
    if (line.includes("Dispute raised:")) {
      const challenger = line.match(/challenger=([1-9A-HJ-NP-Za-km-z]+)/)?.[1];
      const bond = line.match(/bond=(\d+)/)?.[1];
      return {
        type: "disputed",
        wallet: challenger,
        amount: bond ? Number(bond) / 1e6 : undefined,
        data: { challenger, bond, raw: line },
      };
    }
    if (line.includes("Dispute resolved:")) {
      const resolution = line.match(/resolution=(\w+)/)?.[1];
      const toTaker = line.match(/escrow_to_taker=(\d+)/)?.[1];
      const toPoster = line.match(/escrow_to_poster=(\d+)/)?.[1];
      return {
        type: "resolved",
        data: {
          resolution,
          escrowToTaker: toTaker ? Number(toTaker) / 1e6 : 0,
          escrowToPoster: toPoster ? Number(toPoster) / 1e6 : 0,
          raw: line,
        },
      };
    }
    if (line.includes("Job cancelled:")) {
      const signer = line.match(/signer=([1-9A-HJ-NP-Za-km-z]+)/)?.[1];
      return { type: "cancelled", wallet: signer, data: { raw: line } };
    }
  }
  return null;
}

interface HeliusTx {
  signature?: string;
  slot?: number;
  timestamp?: number;
  blockTime?: number;
  meta?: { logMessages?: string[] };
  logMessages?: string[];
  accountData?: { account?: string }[];
}

export async function POST(req: NextRequest) {
  if (!verifyAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: HeliusTx[];
  try {
    const body = await req.json();
    payload = Array.isArray(body) ? body : [body];
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  let processed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const tx of payload) {
    try {
      const sig = tx.signature;
      if (!sig) {
        skipped++;
        continue;
      }

      // Idempotency check
      const existing = await prisma.jobEvent.findUnique({
        where: { txSignature: sig },
      });
      if (existing) {
        skipped++;
        continue;
      }

      const logs = tx.meta?.logMessages ?? tx.logMessages ?? [];
      const event = detectEventType(logs);
      if (!event) {
        skipped++;
        continue;
      }

      // Find the associated Job via account list or fallback hashing.
      // For v1 we look up by pda stored on the Job row; if none, fall
      // back to the most recent open job for the wallet. Real production
      // would parse the instruction data to extract the PDA directly.
      let jobRow = null;
      const accountList = tx.accountData?.map((a) => a.account).filter(Boolean) ?? [];
      if (accountList.length > 0) {
        jobRow = await prisma.job.findFirst({
          where: { pda: { in: accountList as string[] } },
        });
      }
      if (!jobRow && event.wallet) {
        jobRow = await prisma.job.findFirst({
          where: {
            OR: [
              { posterWallet: event.wallet },
              { takerWallet: event.wallet },
            ],
          },
          orderBy: { updatedAt: "desc" },
        });
      }
      if (!jobRow) {
        skipped++;
        continue;
      }

      const blockTime = tx.timestamp ?? tx.blockTime;

      await prisma.jobEvent.create({
        data: {
          jobId: jobRow.id,
          type: event.type,
          txSignature: sig,
          slot: tx.slot ? BigInt(tx.slot) : null,
          blockTime: blockTime ? new Date(blockTime * 1000) : null,
          wallet: event.wallet,
          amount: event.amount,
          // Prisma expects InputJsonValue; our shape is JSON-safe.
          data: event.data as unknown as import("@prisma/client").Prisma.InputJsonValue,
        },
      });

      // Mirror into Job row for fast reads
      const statusMap: Record<string, string> = {
        created: "Open",
        accepted: "Accepted",
        delivered: "Delivered",
        finalized: "Finalized",
        disputed: "Disputed",
        resolved: "Resolved",
        cancelled: "Cancelled",
      };
      const newStatus = statusMap[event.type];
      if (newStatus && newStatus !== jobRow.status) {
        await prisma.job.update({
          where: { id: jobRow.id },
          data: {
            status: newStatus,
            ...(event.type === "delivered"
              ? {
                  deliveredAt: new Date(),
                  challengeEndAt: new Date(
                    Date.now() + jobRow.challengePeriod * 1000,
                  ),
                }
              : {}),
          },
        });
      }

      processed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg);
      console.error("[helius-webhook] tx processing failed:", err);
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    skipped,
    errors: errors.length ? errors : undefined,
    total: payload.length,
  });
}

/** Simple health check for Helius webhook URL validation. */
export async function GET() {
  const hasSecret = Boolean(HELIUS_WEBHOOK_SECRET);
  return NextResponse.json({
    status: "ok",
    endpoint: "/api/helius/webhook",
    authConfigured: hasSecret,
    note: hasSecret
      ? "Ready. POST transaction payloads to this endpoint."
      : "WARNING: HELIUS_WEBHOOK_SECRET not set; endpoint is unauthenticated.",
  });
}
