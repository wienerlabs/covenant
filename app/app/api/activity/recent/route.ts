import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatAddress } from "@/lib/format";

// ---------------------------------------------------------------------------
// Unified activity item shape
// ---------------------------------------------------------------------------
interface ActivityItem {
  id: string;
  type: "job_event" | "achievement" | "arena_battle" | "transaction";
  message: string;
  wallet?: string;
  amount?: number;
  timestamp: string; // ISO date
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Message formatters
// ---------------------------------------------------------------------------

function jobEventMessage(type: string, wallet: string | null, amount: number | null): string {
  const w = wallet ? formatAddress(wallet) : "unknown";
  switch (type) {
    case "created":
      return `Job created by ${w}`;
    case "accepted":
      return `Job accepted by ${w}`;
    case "delivered":
      return `Job delivered by ${w}`;
    case "finalized":
      return amount != null
        ? `Payment finalized \u2014 $${amount.toFixed(2)} USDC`
        : `Payment finalized by ${w}`;
    case "disputed":
      return `Dispute raised by ${w}`;
    case "resolved":
      return `Dispute resolved \u2014 ${w}`;
    case "cancelled":
      return `Job cancelled by ${w}`;
    default:
      return `${type} by ${w}`;
  }
}

function achievementMessage(wallet: string, key: string): string {
  return `${formatAddress(wallet)} unlocked ${key.replace(/_/g, " ")}`;
}

function arenaMessage(
  alpha: string,
  omega: string,
  winner: string | null,
  alphaScore: number,
  omegaScore: number,
): string {
  const a = formatAddress(alpha);
  const o = formatAddress(omega);
  if (!winner) {
    return `${a} vs ${o} \u2014 Draw (${alphaScore}-${omegaScore})`;
  }
  const w = formatAddress(winner);
  return `${a} vs ${o} \u2014 ${w} wins (${alphaScore}-${omegaScore})`;
}

function transactionMessage(type: string, wallet: string, amount: number | null): string {
  const w = formatAddress(wallet);
  switch (type) {
    case "create_job":
      return amount != null
        ? `Escrow locked \u2014 $${amount.toFixed(2)} USDC`
        : `Escrow locked by ${w}`;
    case "finalize_payment":
      return amount != null
        ? `Payment released \u2014 $${amount.toFixed(2)} USDC`
        : "Payment released";
    case "accept_job":
      return `Job accepted by ${w}`;
    case "submit_work":
      return `Work submitted by ${w}`;
    case "raise_dispute":
      return `Dispute raised by ${w}`;
    case "resolve_dispute":
      return `Dispute resolved by ${w}`;
    case "cancel_job":
      return amount != null
        ? `Job cancelled \u2014 $${amount.toFixed(2)} USDC refunded`
        : `Job cancelled by ${w}`;
    default:
      return `${type.replace(/_/g, " ")} by ${w}`;
  }
}

// ---------------------------------------------------------------------------
// GET /api/activity/recent
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    // Run all four queries in parallel for speed
    const [jobEvents, achievements, battles, transactions] = await Promise.all([
      prisma.jobEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 15,
        select: {
          id: true,
          type: true,
          wallet: true,
          amount: true,
          createdAt: true,
          jobId: true,
        },
      }),

      prisma.userAchievement.findMany({
        orderBy: { unlockedAt: "desc" },
        take: 5,
        select: {
          id: true,
          walletAddress: true,
          achievementKey: true,
          unlockedAt: true,
        },
      }),

      prisma.arenaBattle.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          alphaAgent: true,
          omegaAgent: true,
          winnerAgent: true,
          alphaScore: true,
          omegaScore: true,
          createdAt: true,
        },
      }),

      prisma.transaction.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          type: true,
          wallet: true,
          amount: true,
          createdAt: true,
        },
      }),
    ]);

    // Normalize into a flat array
    const items: ActivityItem[] = [];

    for (const ev of jobEvents) {
      items.push({
        id: ev.id,
        type: "job_event",
        message: jobEventMessage(ev.type, ev.wallet, ev.amount),
        wallet: ev.wallet ?? undefined,
        amount: ev.amount ?? undefined,
        timestamp: ev.createdAt.toISOString(),
        metadata: { jobId: ev.jobId, eventType: ev.type },
      });
    }

    for (const ach of achievements) {
      items.push({
        id: ach.id,
        type: "achievement",
        message: achievementMessage(ach.walletAddress, ach.achievementKey),
        wallet: ach.walletAddress,
        timestamp: ach.unlockedAt.toISOString(),
        metadata: { achievementKey: ach.achievementKey },
      });
    }

    for (const battle of battles) {
      items.push({
        id: battle.id,
        type: "arena_battle",
        message: arenaMessage(
          battle.alphaAgent,
          battle.omegaAgent,
          battle.winnerAgent,
          battle.alphaScore,
          battle.omegaScore,
        ),
        timestamp: battle.createdAt.toISOString(),
        metadata: {
          alphaAgent: battle.alphaAgent,
          omegaAgent: battle.omegaAgent,
          winnerAgent: battle.winnerAgent,
          alphaScore: battle.alphaScore,
          omegaScore: battle.omegaScore,
        },
      });
    }

    for (const tx of transactions) {
      items.push({
        id: tx.id,
        type: "transaction",
        message: transactionMessage(tx.type, tx.wallet, tx.amount),
        wallet: tx.wallet,
        amount: tx.amount ?? undefined,
        timestamp: tx.createdAt.toISOString(),
        metadata: { transactionType: tx.type },
      });
    }

    // Sort all by timestamp descending, take top 30
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const recent = items.slice(0, 30);

    return NextResponse.json({ items: recent });
  } catch (err) {
    console.error("[activity/recent] Error fetching activity:", err);
    return NextResponse.json({ items: [] }, { status: 500 });
  }
}
