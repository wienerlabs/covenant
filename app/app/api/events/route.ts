import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface EventItem {
  timestamp: string;
  type: string;
  description: string;
  wallets: string[];
  amount: number | null;
  txHash: string | null;
}

export async function GET() {
  try {
    const [transactions, jobs] = await Promise.all([
      prisma.transaction.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.job.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { submissions: true },
      }),
    ]);

    const events: EventItem[] = [];

    // Map transactions to events
    for (const tx of transactions) {
      events.push({
        timestamp: tx.createdAt.toISOString(),
        type: tx.type,
        description: formatTxDescription(tx.type, tx.wallet, tx.amount),
        wallets: [tx.wallet],
        amount: tx.amount,
        txHash: tx.txHash,
      });
    }

    // Map jobs to events (only if not already captured by transactions)
    const txJobIds = new Set(transactions.map((t) => t.jobId).filter(Boolean));
    for (const job of jobs) {
      if (!txJobIds.has(job.id)) {
        events.push({
          timestamp: job.createdAt.toISOString(),
          type: "job_created",
          description: `Job created: ${(job.specJson as Record<string, unknown>)?.title || job.id.slice(0, 8)}`,
          wallets: [job.posterWallet, ...(job.takerWallet ? [job.takerWallet] : [])],
          amount: job.amount,
          txHash: job.txHash,
        });
      }

      // Add submission events
      for (const sub of job.submissions) {
        events.push({
          timestamp: sub.submittedAt.toISOString(),
          type: "submission",
          description: `Work submitted: ${sub.wordCount} words (${sub.verified ? "verified" : "pending"})`,
          wallets: [sub.takerWallet],
          amount: null,
          txHash: sub.txHash,
        });
      }
    }

    // Sort by timestamp descending
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({ events: events.slice(0, 100) });
  } catch (error) {
    console.error("GET /api/events error:", error);
    return NextResponse.json(
      { error: "Failed to fetch events" },
      { status: 500 }
    );
  }
}

function formatTxDescription(type: string, wallet: string, amount: number | null): string {
  const w = wallet.slice(0, 4) + "..." + wallet.slice(-4);
  switch (type) {
    case "create_job":
      return `${w} created a job${amount ? ` for ${amount} USDC` : ""}`;
    case "accept_job":
      return `${w} accepted a job`;
    case "submit_completion":
      return `${w} submitted work completion`;
    case "cancel_job":
      return `${w} cancelled a job`;
    default:
      return `${w}: ${type}`;
  }
}
