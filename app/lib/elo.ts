import { prisma } from "@/lib/prisma";

const K_FACTOR = 32;
const DEFAULT_ELO = 1200;

/**
 * Calculate new ELO ratings after a match.
 * Returns [newWinnerElo, newLoserElo].
 */
export function calculateElo(
  winnerElo: number,
  loserElo: number,
  k = K_FACTOR,
): [number, number] {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  const expectedLoser = 1 - expectedWinner;

  const newWinnerElo = Math.round(winnerElo + k * (1 - expectedWinner));
  const newLoserElo = Math.round(loserElo + k * (0 - expectedLoser));

  return [newWinnerElo, Math.max(100, newLoserElo)]; // floor at 100
}

/**
 * Calculate ELO for a draw.
 */
export function calculateEloDraw(
  eloA: number,
  eloB: number,
  k = K_FACTOR,
): [number, number] {
  const expectedA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
  const expectedB = 1 - expectedA;

  const newA = Math.round(eloA + k * (0.5 - expectedA));
  const newB = Math.round(eloB + k * (0.5 - expectedB));

  return [Math.max(100, newA), Math.max(100, newB)];
}

/**
 * Get or create an agent's ELO record. If a name is provided AND the
 * stored record's name is still the wallet-fallback (new agent that
 * was first created without a name), update it to the real name. This
 * lets the leaderboard + battle history show "MyCustomBot" instead of
 * the raw wallet for every agent that ever plays a named battle.
 */
export async function getAgentElo(agentWallet: string, agentName?: string) {
  const row = await prisma.agentElo.upsert({
    where: { agentWallet },
    create: {
      agentWallet,
      agentName: agentName ?? agentWallet,
      elo: DEFAULT_ELO,
    },
    update: {},
  });

  // Backfill missing / stale name without rewriting on every call.
  if (agentName && agentName !== row.agentName && row.agentName === row.agentWallet) {
    try {
      await prisma.agentElo.update({
        where: { agentWallet },
        data: { agentName },
      });
      row.agentName = agentName;
    } catch {
      /* non-fatal — keep returning the row we have */
    }
  }

  return row;
}

/**
 * Update ELO after a battle. Saves to DB and returns deltas.
 * `winnerName` / `loserName` let the arena pass custom agent display
 * names through to the ELO table so the leaderboard shows the real
 * name instead of the wallet address fallback.
 */
export async function updateEloAfterBattle(
  winnerWallet: string,
  loserWallet: string,
  battleId: string,
  winnerName?: string,
  loserName?: string,
) {
  const winner = await getAgentElo(winnerWallet, winnerName);
  const loser = await getAgentElo(loserWallet, loserName);

  const [newWinnerElo, newLoserElo] = calculateElo(winner.elo, loser.elo);

  await prisma.$transaction([
    prisma.agentElo.update({
      where: { agentWallet: winnerWallet },
      data: {
        elo: newWinnerElo,
        wins: { increment: 1 },
        peakElo: Math.max(winner.peakElo, newWinnerElo),
        currentStreak: winner.currentStreak + 1,
        bestStreak: Math.max(winner.bestStreak, winner.currentStreak + 1),
      },
    }),
    prisma.agentElo.update({
      where: { agentWallet: loserWallet },
      data: {
        elo: newLoserElo,
        losses: { increment: 1 },
        currentStreak: 0,
      },
    }),
    prisma.arenaBattle.update({
      where: { id: battleId },
      data: {
        alphaEloBefore: winner.agentWallet === winnerWallet ? winner.elo : loser.elo,
        omegaEloBefore: winner.agentWallet === winnerWallet ? loser.elo : winner.elo,
        alphaEloAfter: winner.agentWallet === winnerWallet ? newWinnerElo : newLoserElo,
        omegaEloAfter: winner.agentWallet === winnerWallet ? newLoserElo : newWinnerElo,
      },
    }),
  ]);

  return {
    winnerEloBefore: winner.elo,
    winnerEloAfter: newWinnerElo,
    winnerDelta: newWinnerElo - winner.elo,
    loserEloBefore: loser.elo,
    loserEloAfter: newLoserElo,
    loserDelta: newLoserElo - loser.elo,
    winnerStreak: winner.currentStreak + 1,
  };
}

/**
 * Get ELO leaderboard (top agents).
 */
export async function getEloLeaderboard(limit = 20) {
  return prisma.agentElo.findMany({
    orderBy: { elo: "desc" },
    take: limit,
  });
}

/**
 * Update category-specific ELO after a battle.
 */
export async function updateCategoryElo(
  winnerWallet: string,
  loserWallet: string,
  category: string,
) {
  const winnerCat = await prisma.agentCategoryElo.upsert({
    where: { agentWallet_category: { agentWallet: winnerWallet, category } },
    create: { agentWallet: winnerWallet, category, elo: 1200 },
    update: {},
  });
  const loserCat = await prisma.agentCategoryElo.upsert({
    where: { agentWallet_category: { agentWallet: loserWallet, category } },
    create: { agentWallet: loserWallet, category, elo: 1200 },
    update: {},
  });

  const [newWin, newLose] = calculateElo(winnerCat.elo, loserCat.elo);

  await prisma.$transaction([
    prisma.agentCategoryElo.update({
      where: { agentWallet_category: { agentWallet: winnerWallet, category } },
      data: { elo: newWin, wins: { increment: 1 } },
    }),
    prisma.agentCategoryElo.update({
      where: { agentWallet_category: { agentWallet: loserWallet, category } },
      data: { elo: newLose, losses: { increment: 1 } },
    }),
  ]);
}
