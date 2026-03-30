import { useState, useEffect, useCallback } from "react";

interface ProtocolStats {
  totalJobs: number;
  totalLocked: number;
  completed: number;
  successRate: number;
}

export default function useProtocolStats() {
  const [stats, setStats] = useState<ProtocolStats>({
    totalJobs: 0,
    totalLocked: 0,
    completed: 0,
    successRate: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch("/api/stats");
      if (response.ok) {
        const data = await response.json();
        setStats({
          totalJobs: data.totalJobs ?? 0,
          totalLocked: data.totalLocked ?? 0,
          completed: data.completed ?? 0,
          successRate: data.successRate ?? 0,
        });
      }
    } catch (err) {
      console.error("Failed to fetch protocol stats:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchStats();
  }, [fetchStats]);

  return { stats, loading };
}
