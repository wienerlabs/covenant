import { useCallback } from "react";
import useJobList from "./useJobList";
import { toast } from "@/lib/toast";

interface UseCovenantJobsOptions {
  walletPubkey?: string | null;
  filter?: "all" | "mine" | "open";
}

export default function useCovenantJobs({ walletPubkey, filter = "all" }: UseCovenantJobsOptions) {
  const { jobs, loading, error, refetch, total, totalPages, page } = useJobList({
    filter,
    walletPubkey,
  });

  const createJob = useCallback(
    async (data: {
      category: string;
      amount: number;
      paymentToken: string;
      minWords: number;
      deadline: string;
    }) => {
      if (!walletPubkey) {
        toast("Connect your wallet first", "error");
        return null;
      }
      try {
        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ posterWallet: walletPubkey, ...data }),
        });
        if (!res.ok) {
          const d = await res.json();
          toast(d.error || "Failed to create job", "error");
          return null;
        }
        const result = await res.json();
        toast("Job created successfully!", "success");
        refetch();
        return result;
      } catch {
        toast("Network error creating job", "error");
        return null;
      }
    },
    [walletPubkey, refetch]
  );

  const acceptJob = useCallback(
    async (jobId: string) => {
      if (!walletPubkey) {
        toast("Connect your wallet first", "error");
        return false;
      }
      try {
        const res = await fetch(`/api/jobs/${jobId}/accept`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ takerWallet: walletPubkey }),
        });
        if (!res.ok) {
          const d = await res.json();
          toast(d.error || "Failed to accept job", "error");
          return false;
        }
        toast("Job accepted!", "success");
        refetch();
        return true;
      } catch {
        toast("Network error accepting job", "error");
        return false;
      }
    },
    [walletPubkey, refetch]
  );

  const submitWork = useCallback(
    async (jobId: string, text: string, wordCount: number) => {
      if (!walletPubkey) {
        toast("Connect your wallet first", "error");
        return false;
      }
      try {
        const res = await fetch(`/api/jobs/${jobId}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ takerWallet: walletPubkey, text, wordCount }),
        });
        if (!res.ok) {
          const d = await res.json();
          toast(d.error || "Failed to submit work", "error");
          return false;
        }
        toast("Work submitted and verified!", "success");
        refetch();
        return true;
      } catch {
        toast("Network error submitting work", "error");
        return false;
      }
    },
    [walletPubkey, refetch]
  );

  const cancelJob = useCallback(
    async (jobId: string) => {
      if (!walletPubkey) {
        toast("Connect your wallet first", "error");
        return false;
      }
      try {
        const res = await fetch(`/api/jobs/${jobId}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signerWallet: walletPubkey }),
        });
        if (!res.ok) {
          const d = await res.json();
          toast(d.error || "Failed to cancel job", "error");
          return false;
        }
        toast("Job cancelled", "success");
        refetch();
        return true;
      } catch {
        toast("Network error cancelling job", "error");
        return false;
      }
    },
    [walletPubkey, refetch]
  );

  return {
    jobs,
    loading,
    error,
    createJob,
    acceptJob,
    submitWork,
    cancelJob,
    total,
    totalPages,
    page,
  };
}
