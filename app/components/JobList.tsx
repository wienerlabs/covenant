"use client";

import { useState, useCallback } from "react";
import JobCard from "./JobCard";
import AsciiAnimation from "./AsciiAnimation";
import useJobList from "@/hooks/useJobList";

interface JobListProps {
  filter: "all" | "mine";
  walletPubkey?: string;
}

export default function JobList({ filter, walletPubkey }: JobListProps) {
  const { jobs, loading, refresh } = useJobList({ filter, walletPubkey });
  const [refreshHover, setRefreshHover] = useState(false);

  const handleAccept = useCallback((jobPda: string) => {
    console.log("Accept job:", jobPda);
  }, []);

  const handleOpenWork = useCallback((jobPda: string) => {
    console.log("Open work:", jobPda);
  }, []);

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
            Open Positions
          </h2>
          {!loading && (
            <span style={{ fontSize: "11px", color: "#555555" }}>
              ({jobs.length})
            </span>
          )}
        </div>
        <button
          onClick={refresh}
          onMouseEnter={() => setRefreshHover(true)}
          onMouseLeave={() => setRefreshHover(false)}
          style={{
            fontFamily: "inherit",
            fontSize: "11px",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            padding: "4px 12px",
            cursor: "pointer",
            border: "1px solid #000000",
            backgroundColor: refreshHover ? "#000000" : "#ffffff",
            color: refreshHover ? "#ffffff" : "#000000",
            transition: "all 0.15s ease",
          }}
        >
          Refresh
        </button>
      </div>

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                border: "1px solid #000000",
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
              <style>{`
                @keyframes shimmer {
                  0% { transform: translateX(-50%); }
                  100% { transform: translateX(50%); }
                }
              `}</style>
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
        <div
          style={{
            textAlign: "center",
            padding: "48px 0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <AsciiAnimation scene="idle" />
          <div
            style={{
              fontSize: "12px",
              color: "#555555",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            No jobs found
          </div>
        </div>
      )}

      {!loading && jobs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {jobs.map((entry) => (
            <JobCard
              key={entry.jobPda}
              job={entry.job}
              jobPda={entry.jobPda}
              onAccept={handleAccept}
              onOpenWork={handleOpenWork}
              connectedWallet={walletPubkey}
            />
          ))}
        </div>
      )}
    </div>
  );
}
