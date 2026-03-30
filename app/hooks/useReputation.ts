import { useState, useEffect } from "react";

interface ReputationData {
  completed: number;
  failed: number;
  totalEarned: number;
}

export default function useReputation(walletPubkey?: string) {
  const [reputation, setReputation] = useState<ReputationData>({
    completed: 0,
    failed: 0,
    totalEarned: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setTimeout(() => {
      if (walletPubkey) {
        setReputation({
          completed: 12,
          failed: 1,
          totalEarned: 4850.0,
        });
      } else {
        setReputation({
          completed: 0,
          failed: 0,
          totalEarned: 0,
        });
      }
      setLoading(false);
    }, 600);
  }, [walletPubkey]);

  return { reputation, loading };
}
