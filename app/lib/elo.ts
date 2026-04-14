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
 * Get or create an agent's ELO record.
 */
export async function getAgentElo(agentWallet: string, agentName?: string) {
  return prisma.agentElo.upsert({
    where: { agentWallet },
    create: {
      agentWallet,
      agentName: agentName ?? agentWallet,
      elo: DEFAULT_ELO,
    },
    update: {},
  });
}

/**
 * Update ELO after a battle. Saves to DB and returns deltas.
 */
export async function updateEloAfterBattle(
  winnerWallet: string,
  loserWallet: string,
  battleId: string,
) {
  const winner = await getAgentElo(winnerWallet);
  const loser = await getAgentElo(loserWallet);

  const [newWinnerElo, newLoserElo] = calculateElo(winner.elo, loser.elo);

  await prisma.$transaction([
    prisma.agentElo.update({
      where: { agentWallet: winnerWallet },
      data: {
        elo: newWinnerElo,
        wins: { increment: 1 },
        peakElo: Math.max(winner.peakElo, newWinnerElo),
      },
    }),
    prisma.agentElo.update({
      where: { agentWallet: loserWallet },
      data: {
        elo: newLoserElo,
        losses: { increment: 1 },
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
