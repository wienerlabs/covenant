"use client";

import { useState } from "react";
import StatusBadge from "./StatusBadge";
import AsciiAnimation from "./AsciiAnimation";
import { formatAddress, formatUsdc, formatDate } from "@/lib/format";

interface JobData {
  poster: string;
  taker: string | null;
  amount: number;
  specHash: string;
  status: "Open" | "Accepted" | "Completed" | "Cancelled";
  createdAt: number;
  deadline: number;
  minWords: number;
}

interface JobCardProps {
  job: JobData;
  jobPda: string;
  onAccept?: (jobPda: string) => void;
  onOpenWork?: (jobPda: string) => void;
  connectedWallet?: string;
}

const sceneMap: Record<JobData["status"], "escrow" | "handshake" | "proof" | "idle"> = {
  Open: "escrow",
  Accepted: "handshake",
  Completed: "proof",
  Cancelled: "idle",
};

export default function JobCard({
  job,
  jobPda,
  onAccept,
  onOpenWork,
  connectedWallet,
}: JobCardProps) {
  const [btnHover, setBtnHover] = useState<string | null>(null);

  const isPoster = connectedWallet === job.poster;
  const isTaker = connectedWallet === job.taker;

  const primaryBtn = (id: string): React.CSSProperties => ({
    fontFamily: "inherit",
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    padding: "8px 20px",
    cursor: "pointer",
    border: "1px solid #000000",
    borderRadius: "6px",
    backgroundColor: btnHover === id ? "#ffffff" : "#000000",
    color: btnHover === id ? "#000000" : "#ffffff",
    transition: "all 0.15s ease",
  });

  const ghostBtn = (id: string): React.CSSProperties => ({
    fontFamily: "inherit",
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    padding: "8px 20px",
    cursor: "pointer",
    border: "1px solid #000000",
    borderRadius: "6px",
    backgroundColor: btnHover === id ? "#000000" : "#ffffff",
    color: btnHover === id ? "#ffffff" : "#000000",
    transition: "all 0.15s ease",
  });

  const labelStyle: React.CSSProperties = {
    fontSize: "10px",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: "#555555",
    marginBottom: "2px",
  };

  return (
    <div
      style={{
        border: "1px solid #000000",
        borderRadius: "10px",
        backgroundColor: "#ffffff",
        transition: "border-color 0.15s ease",
        padding: "20px",
        display: "grid",
        gridTemplateColumns: "1fr 160px",
        gap: "16px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <StatusBadge status={job.status} />
          <span style={{ fontSize: "10px", color: "#999" }}>
            {formatAddress(jobPda)}
          </span>
        </div>

        <div style={{ fontSize: "22px", fontWeight: 700 }}>
          {formatUsdc(job.amount)} USDC
        </div>

        <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
          <div>
            <div style={labelStyle}>Poster</div>
            <div style={{ fontSize: "11px" }}>{formatAddress(job.poster)}</div>
          </div>
          {job.taker && (
            <div>
              <div style={labelStyle}>Taker</div>
              <div style={{ fontSize: "11px" }}>{formatAddress(job.taker)}</div>
            </div>
          )}
          <div>
            <div style={labelStyle}>Deadline</div>
            <div style={{ fontSize: "11px" }}>{formatDate(job.deadline)}</div>
          </div>
          <div>
            <div style={labelStyle}>Min Words</div>
            <div style={{ fontSize: "11px" }}>{job.minWords.toLocaleString()}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
          {job.status === "Open" && !isPoster && onAccept && (
            <button
              style={primaryBtn("accept")}
              onMouseEnter={() => setBtnHover("accept")}
              onMouseLeave={() => setBtnHover(null)}
              onClick={() => onAccept(jobPda)}
            >
              Accept Job
            </button>
          )}
          {job.status === "Accepted" && isTaker && onOpenWork && (
            <button
              style={primaryBtn("submit")}
              onMouseEnter={() => setBtnHover("submit")}
              onMouseLeave={() => setBtnHover(null)}
              onClick={() => onOpenWork(jobPda)}
            >
              Submit Work
            </button>
          )}
          {job.status === "Open" && isPoster && (
            <button
              style={ghostBtn("cancel")}
              onMouseEnter={() => setBtnHover("cancel")}
              onMouseLeave={() => setBtnHover(null)}
            >
              Cancel Job
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
        <AsciiAnimation scene={sceneMap[job.status]} width="150px" height="110px" />
      </div>
    </div>
  );
}
