import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function truncateWallet(wallet: string): string {
  if (wallet.length <= 10) return wallet;
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}

export async function GET() {
  try {
    const recentJobs = await prisma.job.findMany({
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        id: true,
        posterWallet: true,
        takerWallet: true,
        amount: true,
        status: true,
        txHash: true,
        updatedAt: true,
      },
    });

    // Also fetch transaction records keyed by jobId for accept/cancel tx hashes
    const jobIds = recentJobs.map((j) => j.id);
    const txRecords = await prisma.transaction.findMany({
      where: { jobId: { in: jobIds } },
      orderBy: { createdAt: "desc" },
    });

    // Build a map: jobId -> { type -> txHash }
    const txMap: Record<string, Record<string, string>> = {};
    for (const tx of txRecords) {
      if (tx.jobId) {
        if (!txMap[tx.jobId]) txMap[tx.jobId] = {};
        if (!txMap[tx.jobId][tx.type]) {
          txMap[tx.jobId][tx.type] = tx.txHash;
        }
      }
    }

    const items: { text: string; txHash: string | null }[] = [];

    for (const job of recentJobs) {
      const shortId = job.id.slice(0, 8);
      const jobTxs = txMap[job.id] || {};

      switch (job.status) {
        case "Open":
          items.push({
            text: `JOB ${shortId} CREATED -- ${job.amount.toFixed(0)} USDC`,
            txHash: job.txHash || jobTxs["create_job"] || null,
          });
          break;
        case "Accepted":
          items.push({
            text: `JOB ${shortId} ACCEPTED BY ${truncateWallet(job.takerWallet || "unknown")}`,
            txHash: jobTxs["accept_job"] || null,
          });
          break;
        case "Completed":
          items.push({
            text: `VERIFIED -- JOB ${shortId} COMPLETE -- ${job.amount.toFixed(0)} USDC RELEASED`,
            txHash: jobTxs["submit_completion"] || null,
          });
          break;
        case "Cancelled":
          items.push({
            text: `JOB ${shortId} CANCELLED -- ${job.amount.toFixed(0)} USDC REFUNDED`,
            txHash: jobTxs["cancel_job"] || null,
          });
          break;
      }
    }

    // If no activity yet, return a default
    if (items.length === 0) {
      items.push({ text: "NO ACTIVITY YET -- CREATE THE FIRST JOB", txHash: null });
    }

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [{ text: "PROTOCOL ONLINE -- AWAITING JOBS", txHash: null }] });
  }
}
