import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Top Takers: profiles + reputation, ordered by jobsCompleted desc
    const reputations = await prisma.reputation.findMany({
      orderBy: { jobsCompleted: "desc" },
      take: 10,
    });

    const takerWallets = reputations.map((r) => r.walletAddress);
    const takerProfiles = await prisma.profile.findMany({
      where: { walletAddress: { in: takerWallets } },
    });
    const takerProfileMap = new Map(takerProfiles.map((p) => [p.walletAddress, p]));

    const topTakers = reputations.map((r, i) => {
      const profile = takerProfileMap.get(r.walletAddress);
      return {
        rank: i + 1,
        wallet: r.walletAddress,
        displayName: profile?.displayName || r.walletAddress,
        avatarSeed: profile?.avatarSeed || hashWallet(r.walletAddress),
        avatarUrl: profile?.avatarUrl || null,
        jobsCompleted: r.jobsCompleted,
        totalEarned: r.totalEarned,
      };
    });

    // Top Posters: count jobs per posterWallet, join with profiles
    const posterGroups = await prisma.job.groupBy({
      by: ["posterWallet"],
      _count: { id: true },
      _sum: { amount: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    });

    const posterWallets = posterGroups.map((g) => g.posterWallet);
    const posterProfiles = await prisma.profile.findMany({
      where: { walletAddress: { in: posterWallets } },
    });
    const posterProfileMap = new Map(posterProfiles.map((p) => [p.walletAddress, p]));

    const topPosters = posterGroups.map((g, i) => {
      const profile = posterProfileMap.get(g.posterWallet);
      return {
        rank: i + 1,
        wallet: g.posterWallet,
        displayName: profile?.displayName || g.posterWallet,
        avatarSeed: profile?.avatarSeed || hashWallet(g.posterWallet),
        avatarUrl: profile?.avatarUrl || null,
        jobsPosted: g._count.id,
        totalSpent: g._sum.amount || 0,
      };
    });

    return NextResponse.json({ topTakers, topPosters });
  } catch (error) {
    console.error("GET /api/leaderboard error:", error);
    return NextResponse.json(
      { error: "Failed to fetch leaderboard" },
      { status: 500 }
    );
  }
}

function hashWallet(wallet: string): string {
  let hash = 0;
  for (let i = 0; i < wallet.length; i++) {
    hash = (hash * 31 + wallet.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}
