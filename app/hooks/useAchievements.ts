import { useState, useEffect, useCallback } from "react";

interface Achievement {
  key: string;
  title: string;
  description: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  xpReward: number;
  unlocked: boolean;
}

interface AchievementsData {
  achievements: Achievement[];
  newlyUnlocked: string[];
}

const DEFAULT_ACHIEVEMENTS: AchievementsData = {
  achievements: [],
  newlyUnlocked: [],
};

export default function useAchievements(wallet?: string | null) {
  const [data, setData] = useState<AchievementsData>(DEFAULT_ACHIEVEMENTS);
  const [loading, setLoading] = useState(true);

  const fetchAchievements = useCallback(async () => {
    if (!wallet) {
      setData(DEFAULT_ACHIEVEMENTS);
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/achievements/${wallet}`);
      if (response.ok) {
        const json = await response.json();
        setData({
          achievements: json.achievements ?? [],
          newlyUnlocked: json.newlyUnlocked ?? [],
        });
      }
    } catch (err) {
      console.error("Failed to fetch achievements:", err);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    setLoading(true);
    fetchAchievements();
  }, [fetchAchievements]);

  return { ...data, loading };
}
