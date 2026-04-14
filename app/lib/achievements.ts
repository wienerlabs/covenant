import { prisma } from "@/lib/prisma";
import { awardXP } from "@/lib/xp";

export type AchievementRarity = "common" | "rare" | "epic" | "legendary";

export interface AchievementDef {
  key: string;
  title: string;
  description: string;
  rarity: AchievementRarity;
  xpReward: number;
}

/**
 * All achievement definitions. Conditions are checked in checkAndUnlock().
 */
export const ACHIEVEMENTS: AchievementDef[] = [
  {
    key: "first_steps",
    title: "First Steps",
    description: "Complete the onboarding wizard",
    rarity: "common",
    xpReward: 25,
  },
  {
    key: "first_blood",
    title: "First Blood",
    description: "Watch your first arena battle",
    rarity: "common",
    xpReward: 5,
  },
  {
    key: "poster",
    title: "Job Creator",
    description: "Post your first job",
    rarity: "common",
    xpReward: 10,
  },
  {
    key: "patron",
    title: "Patron",
    description: "Post 10 or more jobs",
    rarity: "rare",
    xpReward: 50,
  },
  {
    key: "worker",
    title: "Worker",
    description: "Complete your first job",
    rarity: "common",
    xpReward: 10,
  },
  {
    key: "grinder",
    title: "Grinder",
    description: "Complete 50 or more jobs",
    rarity: "epic",
    xpReward: 100,
  },
  {
    key: "high_roller",
    title: "High Roller",
    description: "Lock 100+ USDC in escrow across all jobs",
    rarity: "rare",
    xpReward: 30,
  },
  {
    key: "agent_smith",
    title: "Agent Smith",
    description: "Register a custom AI agent",
    rarity: "rare",
    xpReward: 50,
  },
  {
    key: "speed_demon",
    title: "Speed Demon",
    description: "Complete a job in under 30 seconds",
    rarity: "common",
    xpReward: 20,
  },
  {
    key: "perfectionist",
    title: "Perfectionist",
    description: "Receive a 9+ judge score in arena",
    rarity: "rare",
    xpReward: 25,
  },
  {
    key: "veteran",
    title: "Veteran",
    description: "Reach level 10",
    rarity: "epic",
    xpReward: 100,
  },
  {
    key: "whale",
    title: "Whale",
    description: "Lock 1000+ USDC total across all jobs",
    rarity: "legendary",
    xpReward: 200,
  },
  {
    key: "champion",
    title: "Champion",
    description: "Win 10 arena battles",
    rarity: "legendary",
    xpReward: 150,
  },
];

/** Color mapping for rarity badges. */
export const RARITY_COLORS: Record<AchievementRarity, string> = {
  common: "rgba(255,255,255,0.5)",
  rare: "#fffeb2",
  epic: "#a78bfa",
  legendary: "#FF425E",
};

/**
 * Get a user's unlocked achievement keys.
 */
export async function getUserAchievementKeys(
  walletAddress: string,
): Promise<Set<string>> {
  const rows = await prisma.userAchievement.findMany({
    where: { walletAddress },
    select: { achievementKey: true },
  });
  return new Set(rows.map((r) => r.achievementKey));
}

/**
 * Unlock a specific achievement for a user (if not already unlocked).
 * Awards the XP reward.
 */
export async function unlockAchievement(
  walletAddress: string,
  key: string,
): Promise<boolean> {
  const def = ACHIEVEMENTS.find((a) => a.key === key);
  if (!def) return false;

  // Check if already unlocked
  const existing = await prisma.userAchievement.findUnique({
    where: {
      walletAddress_achievementKey: { walletAddress, achievementKey: key },
    },
  });
  if (existing) return false;

  await prisma.userAchievement.create({
    data: { walletAddress, achievementKey: key },
  });

  await awardXP(walletAddress, def.xpReward, `achievement:${key}`);
  return true;
}

/**
 * Check all conditions and unlock eligible achievements.
 * Returns list of newly unlocked achievement keys.
 */
export async function checkAndUnlock(
  walletAddress: string,
): Promise<string[]> {
  const unlocked = await getUserAchievementKeys(walletAddress);
  const newlyUnlocked: string[] = [];

  // Fetch stats
  const [reputation, xpRecord, postedCount, agentCount] = await Promise.all([
    prisma.reputation.findUnique({ where: { walletAddress } }),
    prisma.userXP.findUnique({ where: { walletAddress } }),
    prisma.job.count({ where: { posterWallet: walletAddress } }),
    prisma.publishedAgent.count({ where: { walletAddress } }),
  ]);

  const jobsCompleted = reputation?.jobsCompleted ?? 0;
  const totalEarned = reputation?.totalEarned ?? 0;
  const level = xpRecord?.level ?? 1;

  // Compute total locked USDC across all posted jobs
  const totalLockedResult = await prisma.job.aggregate({
    where: { posterWallet: walletAddress },
    _sum: { amount: true },
  });
  const totalLocked = totalLockedResult._sum.amount ?? 0;

  // Check conditions
  const checks: [string, boolean][] = [
    ["poster", postedCount >= 1],
    ["patron", postedCount >= 10],
    ["worker", jobsCompleted >= 1],
    ["grinder", jobsCompleted >= 50],
    ["high_roller", totalLocked >= 100],
    ["whale", totalLocked >= 1000],
    ["agent_smith", agentCount >= 1],
    ["veteran", level >= 10],
  ];

  for (const [key, condition] of checks) {
    if (condition && !unlocked.has(key)) {
      const didUnlock = await unlockAchievement(walletAddress, key);
      if (didUnlock) newlyUnlocked.push(key);
    }
  }

  return newlyUnlocked;
}

/**
 * Get full achievement list with unlock status for a user.
 */
export async function getAchievementsForUser(walletAddress: string) {
  const unlocked = await getUserAchievementKeys(walletAddress);

  return ACHIEVEMENTS.map((def) => ({
    ...def,
    unlocked: unlocked.has(def.key),
  }));
}
