import { prisma } from "@/lib/prisma";

/**
 * XP reward amounts for various actions.
 */
export const XP_REWARDS = {
  job_post: 10,
  job_complete: 20,
  job_finalize: 5,
  arena_watch: 5,
  arena_win: 25,
  arena_lose: 10, // participation reward
  agent_register: 50,
  review_given: 5,
  first_job: 25, // bonus for first-ever job
} as const;

/** Calculate level from total XP. Level 1 starts at 0 XP, each level = 100 XP. */
export function xpToLevel(totalXp: number): number {
  return Math.max(1, Math.floor(totalXp / 100) + 1);
}

/** XP needed to reach the next level from current total. */
export function xpToNextLevel(totalXp: number): number {
  const currentLevel = xpToLevel(totalXp);
  const xpForNextLevel = currentLevel * 100;
  return xpForNextLevel - totalXp;
}

/**
 * Award XP to a wallet. Creates the UserXP row if it doesn't exist.
 * Returns the updated record.
 */
export async function awardXP(
  walletAddress: string,
  amount: number,
  _reason?: string,
) {
  const record = await prisma.userXP.upsert({
    where: { walletAddress },
    create: {
      walletAddress,
      totalXp: amount,
      level: xpToLevel(amount),
    },
    update: {
      totalXp: { increment: amount },
    },
  });

  // Recalculate level after increment
  const newLevel = xpToLevel(record.totalXp);
  if (newLevel !== record.level) {
    return prisma.userXP.update({
      where: { walletAddress },
      data: { level: newLevel },
    });
  }

  return record;
}

/**
 * Get XP data for a wallet.
 */
export async function getXP(walletAddress: string) {
  const record = await prisma.userXP.findUnique({
    where: { walletAddress },
  });

  if (!record) {
    return {
      totalXp: 0,
      level: 1,
      xpToNextLevel: 100,
      xpInCurrentLevel: 0,
      xpRequiredForLevel: 100,
    };
  }

  const level = xpToLevel(record.totalXp);
  const xpForCurrentLevel = (level - 1) * 100;
  const xpInCurrentLevel = record.totalXp - xpForCurrentLevel;

  return {
    totalXp: record.totalXp,
    level,
    xpToNextLevel: xpToNextLevel(record.totalXp),
    xpInCurrentLevel,
    xpRequiredForLevel: 100,
  };
}
