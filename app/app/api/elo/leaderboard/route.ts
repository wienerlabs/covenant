import { NextResponse } from "next/server";
import { getEloLeaderboard } from "@/lib/elo";
import { prisma, ensureSchema, retryable } from "@/lib/prisma";
import { memoize } from "@/lib/cache";

export const dynamic = "force-dynamic";

/**
 * GET /api/elo/leaderboard
 *
 * Every agent that has ever played an arena battle, sorted by ELO.
 * Enriches each row with avatar + category metadata from HostedAgent
 * (community agents) or the baked-in default personas (Agent Alpha /
 * Agent Omega) so the leaderboard can show a profile image next to
 * each agent.
 *
 * Caching: 5s in-memory cache via lib/cache memoize() — leaderboard
 * is hit on every page render but updates at most once per battle,
 * so 5s freshness is plenty and cuts the read load by ~50x.
 */
const CACHE_TTL_MS = 5_000;

export async function GET() {
  await ensureSchema().catch(() => { /* non-fatal */ });

  // Cached + retried. DB outages still return [] (200) so the
  // leaderboard page renders an empty state rather than crashing.
  let leaderboard: Awaited<ReturnType<typeof getEloLeaderboard>> = [];
  try {
    leaderboard = await memoize("elo:top50", CACHE_TTL_MS, () =>
      retryable(() => getEloLeaderboard(50)),
    );
  } catch (err) {
    console.error("[elo/leaderboard] getEloLeaderboard failed:", err);
    return NextResponse.json([]);
  }

  const ALPHA_WALLET =
    process.env.NEXT_PUBLIC_AGENT_ALPHA_WALLET ||
    "7GpXEwNrf8BVFBGMYjuYHoSmN1FvGFQD1MTtgJk2u7fG";
  const OMEGA_WALLET =
    process.env.NEXT_PUBLIC_AGENT_OMEGA_WALLET ||
    "55EbEM7x6WQxVFSt1KennwYBPgWF7GgF5bd2R2FVxiw1";

  const walletSet = new Set<string>(leaderboard.map((r) => r.agentWallet));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hostedByWallet = new Map<string, any>();
  try {
    const hosted = await prisma.hostedAgent.findMany({
      where: { walletAddress: { in: Array.from(walletSet) } },
      select: {
        walletAddress: true,
        name: true,
        avatarUrl: true,
        avatarSeed: true,
        category: true,
      },
    });
    for (const h of hosted) hostedByWallet.set(h.walletAddress, h);
  } catch {
    /* no hosted agents / schema drift — fall through with defaults */
  }

  const enriched = leaderboard.map((row) => {
    const isDefault =
      row.agentWallet === ALPHA_WALLET || row.agentWallet === OMEGA_WALLET;
    const hosted = hostedByWallet.get(row.agentWallet);
    const resolvedName =
      row.agentName && row.agentName !== row.agentWallet
        ? row.agentName
        : hosted?.name ||
          (row.agentWallet === ALPHA_WALLET ? "Agent Alpha" : null) ||
          (row.agentWallet === OMEGA_WALLET ? "Agent Omega" : null) ||
          row.agentName;

    return {
      ...row,
      agentName: resolvedName,
      avatarUrl: hosted?.avatarUrl ?? null,
      avatarSeed:
        hosted?.avatarSeed ??
        (row.agentWallet === ALPHA_WALLET
          ? "agent-alpha-covenant-2026"
          : row.agentWallet === OMEGA_WALLET
            ? "agent-omega-covenant-2026"
            : null),
      category: hosted?.category ?? null,
      isCustom: !isDefault && !!hosted,
      isDefault,
    };
  });

  return NextResponse.json(enriched);
}
