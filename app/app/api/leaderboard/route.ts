import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { xpToLevel } from "@/lib/xp";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // ── Users leaderboard: ranked by XP ──
    const xpRecords = await prisma.userXP.findMany({
      orderBy: { totalXp: "desc" },
      take: 50,
    });

    const xpWallets = xpRecords.map((x) => x.walletAddress);

    // Fetch profiles + reputation for those wallets in parallel
    const [profiles, reputations] = await Promise.all([
      prisma.profile.findMany({
        where: { walletAddress: { in: xpWallets } },
      }),
      prisma.reputation.findMany({
        where: { walletAddress: { in: xpWallets } },
      }),
    ]);

    const profileMap = new Map(profiles.map((p) => [p.walletAddress, p]));
    const repMap = new Map(reputations.map((r) => [r.walletAddress, r]));

    const users = xpRecords.map((x, i) => {
      const profile = profileMap.get(x.walletAddress);
      const rep = repMap.get(x.walletAddress);
      return {
        rank: i + 1,
        wallet: x.walletAddress,
        displayName: profile?.displayName || x.walletAddress,
        avatarSeed: profile?.avatarSeed || hashWallet(x.walletAddress),
        avatarUrl: profile?.avatarUrl || null,
        totalXp: x.totalXp,
        level: xpToLevel(x.totalXp),
        jobsCompleted: rep?.jobsCompleted ?? 0,
        totalEarned: rep?.totalEarned ?? 0,
      };
    });

    // ── Legacy fields (kept for backward compat) ──
    const topTakers = users.slice(0, 10).map((u) => ({
      rank: u.rank,
      wallet: u.wallet,
      displayName: u.displayName,
      avatarSeed: u.avatarSeed,
      avatarUrl: u.avatarUrl,
      jobsCompleted: u.jobsCompleted,
      totalEarned: u.totalEarned,
    }));

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

    return NextResponse.json({ users, topTakers, topPosters });
  } catch (error) {
    console.error("GET /api/leaderboard error:", error);
    return NextResponse.json(
      {
        users: [],
        topTakers: [],
        topPosters: [],
        dbHealthy: false,
        error: error instanceof Error ? error.message : "Failed to fetch leaderboard",
      },
      { status: 200 },
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
