import { useState, useEffect, useCallback, useRef } from "react";

export interface JobData {
  id: string;
  pda: string | null;
  posterWallet: string;
  takerWallet: string | null;
  amount: number;
  paymentToken: string;
  specHash: string;
  specJson: Record<string, unknown>;
  status: "Open" | "Accepted" | "Completed" | "Cancelled";
  category: string;
  minWords: number;
  language: string;
  deadline: string;
  createdAt: string;
  updatedAt: string;
}

interface UseJobListOptions {
  filter: "all" | "mine" | "open";
  walletPubkey?: string | null;
  category?: string;
  search?: string;
  minAmount?: number;
  maxAmount?: number;
}

export default function useJobList({ filter, walletPubkey, category, search, minAmount, maxAmount }: UseJobListOptions) {
  const [jobs, setJobs] = useState<JobData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      setError(null);
      const params = new URLSearchParams();

      if (filter === "open") {
        params.set("status", "Open");
      } else if (filter === "mine" && walletPubkey) {
        params.set("poster", walletPubkey);
      }

      if (category) params.set("category", category);
      if (search) params.set("search", search);
      if (minAmount !== undefined && minAmount > 0) params.set("minAmount", String(minAmount));
      if (maxAmount !== undefined && maxAmount > 0) params.set("maxAmount", String(maxAmount));

      const url = `/api/jobs${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error("Failed to fetch jobs");
      }

      let data: JobData[] = await response.json();

      // For "mine" filter, we also need to fetch jobs where the user is the taker
      if (filter === "mine" && walletPubkey) {
        const takerParams = new URLSearchParams();
        takerParams.set("taker", walletPubkey);
        const takerResponse = await fetch(`/api/jobs?${takerParams.toString()}`);
        if (takerResponse.ok) {
          const takerData: JobData[] = await takerResponse.json();
          // Merge and deduplicate
          const allJobs = [...data, ...takerData];
          const seen = new Set<string>();
          data = allJobs.filter((job) => {
            if (seen.has(job.id)) return false;
            seen.add(job.id);
            return true;
          });
        }
      }

      setJobs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch jobs");
    } finally {
      setLoading(false);
    }
  }, [filter, walletPubkey, category, search, minAmount, maxAmount]);

  const refetch = useCallback(() => {
    setLoading(true);
    fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    setLoading(true);
    fetchJobs();

    // Poll every 10 seconds
    intervalRef.current = setInterval(fetchJobs, 10000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchJobs]);

  return { jobs, loading, error, refetch };
}
