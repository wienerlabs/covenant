import { useState, useEffect, useCallback } from "react";

interface XpData {
  totalXp: number;
  level: number;
  xpToNextLevel: number;
  xpInCurrentLevel: number;
  xpRequiredForLevel: number;
}

const DEFAULT_XP: XpData = {
  totalXp: 0,
  level: 1,
  xpToNextLevel: 100,
  xpInCurrentLevel: 0,
  xpRequiredForLevel: 100,
};

export default function useXp(wallet?: string | null) {
  const [xp, setXp] = useState<XpData>(DEFAULT_XP);
  const [loading, setLoading] = useState(true);

  const fetchXp = useCallback(async () => {
    if (!wallet) {
      setXp(DEFAULT_XP);
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/xp/${wallet}`);
      if (response.ok) {
        const data = await response.json();
        setXp({
          totalXp: data.totalXp ?? 0,
          level: data.level ?? 1,
          xpToNextLevel: data.xpToNextLevel ?? 100,
          xpInCurrentLevel: data.xpInCurrentLevel ?? 0,
          xpRequiredForLevel: data.xpRequiredForLevel ?? 100,
        });
      }
    } catch (err) {
      console.error("Failed to fetch XP:", err);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    setLoading(true);
    fetchXp();
  }, [fetchXp]);

  return { xp, loading };
}
