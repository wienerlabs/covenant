import { useState, useEffect, useCallback } from "react";

interface ReputationData {
  jobsCompleted: number;
  jobsFailed: number;
  totalEarned: number;
  firstJobAt: string | null;
}

export default function useReputation(wallet?: string | null) {
  const [reputation, setReputation] = useState<ReputationData>({
    jobsCompleted: 0,
    jobsFailed: 0,
    totalEarned: 0,
    firstJobAt: null,
  });
  const [loading, setLoading] = useState(true);

  const fetchReputation = useCallback(async () => {
    if (!wallet) {
      setReputation({
        jobsCompleted: 0,
        jobsFailed: 0,
        totalEarned: 0,
        firstJobAt: null,
      });
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/reputation/${wallet}`);
      if (response.ok) {
        const data = await response.json();
        setReputation({
          jobsCompleted: data.jobsCompleted ?? 0,
          jobsFailed: data.jobsFailed ?? 0,
          totalEarned: data.totalEarned ?? 0,
          firstJobAt: data.firstJobAt ?? null,
        });
      }
    } catch (err) {
      console.error("Failed to fetch reputation:", err);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    setLoading(true);
    fetchReputation();
  }, [fetchReputation]);

  return { reputation, loading };
}
