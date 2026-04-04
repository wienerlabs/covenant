"use client";

import { useState, useCallback } from "react";
import JobCard from "./JobCard";
import AsciiAnimation from "./AsciiAnimation";
import SubmitWorkModal from "./SubmitWorkModal";
import Pagination from "./Pagination";
import EmptyState from "./EmptyState";
import useJobList from "@/hooks/useJobList";
import type { JobData } from "@/hooks/useJobList";
import { toast } from "@/lib/toast";

interface JobListProps {
  filter: "all" | "mine" | "open";
  walletPubkey?: string;
  variant?: "light" | "dark";
  category?: string;
  search?: string;
  minAmount?: number;
  maxAmount?: number;
}

export default function JobList({ filter, walletPubkey, variant = "light", category, search, minAmount, maxAmount }: JobListProps) {
  const isDark = variant === "dark";
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const { jobs, loading, refetch, totalPages } = useJobList({
    filter,
    walletPubkey,
    category,
    search,
    minAmount,
    maxAmount,
    page,
    sortBy,
    sortOrder,
  });
  const [refreshHover, setRefreshHover] = useState(false);
  const [activeSubmitJob, setActiveSubmitJob] = useState<JobData | null>(null);

  const handleAccept = useCallback(
    async (jobId: string) => {
      if (!walletPubkey) {
        toast("Connect your wallet to accept a job.", "error");
        return;
      }
      try {
        const response = await fetch(`/api/jobs/${jobId}/accept`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ takerWallet: walletPubkey }),
        });
        if (!response.ok) {
          const data = await response.json();
          toast(data.error || "Failed to accept job", "error");
          return;
        }
        toast("Job accepted!", "success");
        refetch();
      } catch {
        toast("Failed to accept job", "error");
      }
    },
    [walletPubkey, refetch]
  );

  const handleCancel = useCallback(
    async (jobId: string) => {
      if (!walletPubkey) {
        toast("Connect your wallet to cancel a job.", "error");
        return;
      }
      try {
        const response = await fetch(`/api/jobs/${jobId}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signerWallet: walletPubkey }),
        });
        if (!response.ok) {
          const data = await response.json();
          toast(data.error || "Failed to cancel job", "error");
          return;
        }
        toast("Job cancelled.", "success");
        refetch();
      } catch {
        toast("Failed to cancel job", "error");
      }
    },
    [walletPubkey, refetch]
  );

  const handleOpenWork = useCallback(
    (jobId: string) => {
      const job = jobs.find((j) => j.id === jobId);
      if (job) {
        setActiveSubmitJob(job);
      }
    },
    [jobs]
  );

  const handleSubmitSuccess = useCallback(() => {
    setActiveSubmitJob(null);
    refetch();
  }, [refetch]);

  const handleSortChange = (value: string) => {
    if (value === "date") {
      setSortBy("createdAt");
      setSortOrder("desc");
    } else if (value === "amount") {
      setSortBy("amount");
      setSortOrder("desc");
    } else if (value === "status") {
      setSortBy("status");
      setSortOrder("asc");
    }
    setPage(1);
  };

  const selectStyle: React.CSSProperties = {
    fontFamily: "inherit",
    fontSize: "10px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    padding: "4px 8px",
    cursor: "pointer",
    border: isDark ? "1px solid rgba(255,255,255,0.2)" : "1px solid #ccc",
    borderRadius: "6px",
    backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "#f9f9f9",
    color: isDark ? "rgba(255,255,255,0.7)" : "#333",
    outline: "none",
    backdropFilter: "blur(4px)",
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
          <h2
            style={{
              fontSize: "14px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              margin: 0,
            }}
          >
            <span style={{ color: isDark ? "#ffffff" : "#000000" }}>Open Positions</span>
          </h2>
          {!loading && (
            <span style={{ fontSize: "11px", color: isDark ? "rgba(255,255,255,0.4)" : "#555555" }}>
              ({jobs.length})
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <select
            onChange={(e) => handleSortChange(e.target.value)}
            style={selectStyle}
            defaultValue="date"
          >
            <option value="date" style={{ backgroundColor: isDark ? "#1a1a1a" : "#fff" }}>By Date</option>
            <option value="amount" style={{ backgroundColor: isDark ? "#1a1a1a" : "#fff" }}>By Amount</option>
            <option value="status" style={{ backgroundColor: isDark ? "#1a1a1a" : "#fff" }}>By Status</option>
          </select>
          <button
            onClick={refetch}
            onMouseEnter={() => setRefreshHover(true)}
            onMouseLeave={() => setRefreshHover(false)}
            style={{
              fontFamily: "inherit",
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              padding: "4px 12px",
              cursor: "pointer",
              borderRadius: "6px",
              border: isDark ? "1px solid rgba(255,255,255,0.25)" : "1px solid #000000",
              backgroundColor: isDark
                ? (refreshHover ? "rgba(255,255,255,0.15)" : "transparent")
                : (refreshHover ? "#000000" : "#ffffff"),
              color: isDark
                ? "#ffffff"
                : (refreshHover ? "#ffffff" : "#000000"),
              transition: "all 0.15s ease",
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                border: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid #000000",
                borderRadius: "10px",
                backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "transparent",
                padding: "20px",
                height: "140px",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: "-100%",
                  width: "200%",
                  height: "100%",
                  background:
                    "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.04) 50%, transparent 100%)",
                  animation: `shimmer 1.5s infinite`,
                }}
              />
              <div
                style={{
                  width: "60px",
                  height: "14px",
                  backgroundColor: "rgba(0,0,0,0.06)",
                  marginBottom: "12px",
                }}
              />
              <div
                style={{
                  width: "120px",
                  height: "20px",
                  backgroundColor: "rgba(0,0,0,0.06)",
                  marginBottom: "12px",
                }}
              />
              <div
                style={{
                  width: "200px",
                  height: "12px",
                  backgroundColor: "rgba(0,0,0,0.06)",
                }}
              />
            </div>
          ))}
        </div>
      )}

      {!loading && jobs.length === 0 && (
        <EmptyState
          title="No Jobs Found"
          subtitle="There are no jobs matching your criteria. Try adjusting your filters or check back later."
          type="jobs"
        />
      )}

      {!loading && jobs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onAccept={handleAccept}
              onOpenWork={handleOpenWork}
              onCancel={handleCancel}
              connectedWallet={walletPubkey}
              variant={variant}
            />
          ))}
        </div>
      )}

      {!loading && totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={(p) => setPage(p)}
        />
      )}

      {activeSubmitJob && (
        <SubmitWorkModal
          jobId={activeSubmitJob.id}
          minWords={activeSubmitJob.minWords}
          takerWallet={walletPubkey || ""}
          onClose={() => setActiveSubmitJob(null)}
          onSuccess={handleSubmitSuccess}
        />
      )}
    </div>
  );
}
