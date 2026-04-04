import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function truncateWallet(wallet: string): string {
  if (wallet.length <= 10) return wallet;
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}

type ProfileMap = Map<string, { avatarUrl: string | null; avatarSeed: string }>;

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

    // Collect all wallets to fetch profiles in bulk
    const allWallets = new Set<string>();
    for (const job of recentJobs) {
      allWallets.add(job.posterWallet);
      if (job.takerWallet) allWallets.add(job.takerWallet);
    }
    const profiles = await prisma.profile.findMany({
      where: { walletAddress: { in: Array.from(allWallets) } },
      select: { walletAddress: true, avatarUrl: true, avatarSeed: true },
    });
    const profileMap: ProfileMap = new Map(
      profiles.map((p) => [p.walletAddress, { avatarUrl: p.avatarUrl, avatarSeed: p.avatarSeed }])
    );

    const items: { text: string; txHash: string | null; wallet: string | null; avatarUrl: string | null; avatarSeed: string | null }[] = [];

    for (const job of recentJobs) {
      const shortId = job.id.slice(0, 8);
      const jobTxs = txMap[job.id] || {};
      const posterProfile = profileMap.get(job.posterWallet);
      const takerProfile = job.takerWallet ? profileMap.get(job.takerWallet) : null;

      switch (job.status) {
        case "Open":
          items.push({
            text: `JOB ${shortId} CREATED -- ${job.amount.toFixed(0)} USDC`,
            txHash: job.txHash || jobTxs["create_job"] || null,
            wallet: job.posterWallet,
            avatarUrl: posterProfile?.avatarUrl || null,
            avatarSeed: posterProfile?.avatarSeed || null,
          });
          break;
        case "Accepted":
          items.push({
            text: `JOB ${shortId} ACCEPTED BY ${truncateWallet(job.takerWallet || "unknown")}`,
            txHash: jobTxs["accept_job"] || null,
            wallet: job.takerWallet || null,
            avatarUrl: takerProfile?.avatarUrl || null,
            avatarSeed: takerProfile?.avatarSeed || null,
          });
          break;
        case "Completed":
          items.push({
            text: `VERIFIED -- JOB ${shortId} COMPLETE -- ${job.amount.toFixed(0)} USDC RELEASED`,
            txHash: jobTxs["submit_completion"] || null,
            wallet: job.takerWallet || null,
            avatarUrl: takerProfile?.avatarUrl || null,
            avatarSeed: takerProfile?.avatarSeed || null,
          });
          break;
        case "Cancelled":
          items.push({
            text: `JOB ${shortId} CANCELLED -- ${job.amount.toFixed(0)} USDC REFUNDED`,
            txHash: jobTxs["cancel_job"] || null,
            wallet: job.posterWallet,
            avatarUrl: posterProfile?.avatarUrl || null,
            avatarSeed: posterProfile?.avatarSeed || null,
          });
          break;
      }
    }

    // If no activity yet, return a default
    if (items.length === 0) {
      items.push({ text: "NO ACTIVITY YET -- CREATE THE FIRST JOB", txHash: null, wallet: null, avatarUrl: null, avatarSeed: null });
    }

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [{ text: "PROTOCOL ONLINE -- AWAITING JOBS", txHash: null, wallet: null, avatarUrl: null, avatarSeed: null }] });
  }
}
