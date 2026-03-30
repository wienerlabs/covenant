"use client";

import { useState } from "react";
import StatusBadge from "./StatusBadge";
import AsciiAnimation from "./AsciiAnimation";
import { formatAddress } from "@/lib/format";
import { USDC_LOGO_URL, SOL_LOGO_URL } from "@/lib/constants";
import { getCategoryById } from "@/lib/categories";
import type { JobData } from "@/hooks/useJobList";

interface JobCardProps {
  job: JobData;
  onAccept?: (jobId: string) => void;
  onOpenWork?: (jobId: string) => void;
  onCancel?: (jobId: string) => void;
  connectedWallet?: string;
  variant?: "light" | "dark";
}

const sceneMap: Record<string, "escrow" | "handshake" | "proof" | "idle"> = {
  Open: "escrow",
  Accepted: "handshake",
  Completed: "proof",
  Cancelled: "idle",
};

function formatJobDate(dateStr: string): string {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export default function JobCard({
  job,
  onAccept,
  onOpenWork,
  onCancel,
  connectedWallet,
  variant = "light",
}: JobCardProps) {
  const [btnHover, setBtnHover] = useState<string | null>(null);
  const isDark = variant === "dark";

  const isPoster = connectedWallet === job.posterWallet;
  const isTaker = connectedWallet === job.takerWallet;
  const categoryInfo = getCategoryById(job.category || "text_writing");

  const primaryBtn = (id: string): React.CSSProperties => ({
    fontFamily: "inherit",
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    padding: "8px 20px",
    cursor: "pointer",
    border: isDark ? "1px solid rgba(255,255,255,0.3)" : "1px solid #000000",
    borderRadius: "6px",
    backgroundColor: isDark
      ? (btnHover === id ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.1)")
      : (btnHover === id ? "#ffffff" : "#000000"),
    color: isDark ? "#ffffff" : (btnHover === id ? "#000000" : "#ffffff"),
    transition: "all 0.15s ease",
    backdropFilter: isDark ? "blur(4px)" : "none",
  });

  const ghostBtn = (id: string): React.CSSProperties => ({
    fontFamily: "inherit",
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    padding: "8px 20px",
    cursor: "pointer",
    border: isDark ? "1px solid rgba(255,255,255,0.2)" : "1px solid #000000",
    borderRadius: "6px",
    backgroundColor: isDark
      ? (btnHover === id ? "rgba(255,255,255,0.15)" : "transparent")
      : (btnHover === id ? "#000000" : "#ffffff"),
    color: isDark ? "rgba(255,255,255,0.8)" : (btnHover === id ? "#ffffff" : "#000000"),
    transition: "all 0.15s ease",
  });

  const labelStyle: React.CSSProperties = {
    fontSize: "10px",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: isDark ? "rgba(255,255,255,0.4)" : "#555555",
    marginBottom: "2px",
  };

  return (
    <div
      style={{
        border: isDark ? "1px solid rgba(255,255,255,0.15)" : "1px solid #000000",
        borderRadius: "10px",
        backgroundColor: isDark ? "rgba(255,255,255,0.07)" : "#ffffff",
        backdropFilter: isDark ? "blur(16px)" : "none",
        transition: "all 0.15s ease",
        padding: "20px",
        display: "grid",
        gridTemplateColumns: "1fr 160px",
        gap: "16px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <StatusBadge status={job.status as "Open" | "Accepted" | "Completed" | "Cancelled"} />
          <span style={{
            fontSize: "10px",
            padding: "2px 8px",
            borderRadius: "6px",
            border: isDark ? "1px solid rgba(255,255,255,0.15)" : "1px solid #ddd",
            backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "#f8f8f8",
            color: isDark ? "rgba(255,255,255,0.7)" : "#555",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
          }}>
            {categoryInfo.tag} · {categoryInfo.label}
          </span>
          <span style={{ fontSize: "10px", color: isDark ? "rgba(255,255,255,0.35)" : "#999" }}>
            {formatAddress(job.id)}
          </span>
        </div>

        <div style={{ fontSize: "22px", fontWeight: 700, color: isDark ? "#ffffff" : "#000000", display: "flex", alignItems: "center", gap: "8px" }}>
          <img src={job.paymentToken === "SOL" ? SOL_LOGO_URL : USDC_LOGO_URL} alt={job.paymentToken || "USDC"} width={22} height={22} style={{ borderRadius: "50%" }} />
          {job.amount.toFixed(2)} <span style={{ fontSize: "14px", fontWeight: 500, opacity: 0.6 }}>{job.paymentToken || "USDC"}</span>
        </div>

        <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
          <div>
            <div style={labelStyle}>Poster</div>
            <div style={{ fontSize: "11px", color: isDark ? "rgba(255,255,255,0.7)" : undefined }}>{formatAddress(job.posterWallet)}</div>
          </div>
          {job.takerWallet && (
            <div>
              <div style={labelStyle}>Taker</div>
              <div style={{ fontSize: "11px", color: isDark ? "rgba(255,255,255,0.7)" : undefined }}>{formatAddress(job.takerWallet)}</div>
            </div>
          )}
          <div>
            <div style={labelStyle}>Deadline</div>
            <div style={{ fontSize: "11px", color: isDark ? "rgba(255,255,255,0.7)" : undefined }}>{formatJobDate(job.deadline)}</div>
          </div>
          <div>
            <div style={labelStyle}>Min Words</div>
            <div style={{ fontSize: "11px", color: isDark ? "rgba(255,255,255,0.7)" : undefined }}>{job.minWords.toLocaleString()}</div>
          </div>
          <div>
            <div style={labelStyle}>Type</div>
            <div style={{ fontSize: "11px", color: isDark ? "rgba(255,255,255,0.7)" : undefined }}>{categoryInfo.description}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
          {job.status === "Open" && !isPoster && onAccept && (
            <button
              style={primaryBtn("accept")}
              onMouseEnter={() => setBtnHover("accept")}
              onMouseLeave={() => setBtnHover(null)}
              onClick={() => onAccept(job.id)}
            >
              Accept Job
            </button>
          )}
          {job.status === "Accepted" && isTaker && onOpenWork && (
            <button
              style={primaryBtn("submit")}
              onMouseEnter={() => setBtnHover("submit")}
              onMouseLeave={() => setBtnHover(null)}
              onClick={() => onOpenWork(job.id)}
            >
              Submit Work
            </button>
          )}
          {job.status === "Open" && isPoster && onCancel && (
            <button
              style={ghostBtn("cancel")}
              onMouseEnter={() => setBtnHover("cancel")}
              onMouseLeave={() => setBtnHover(null)}
              onClick={() => onCancel(job.id)}
            >
              Cancel Job
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
        <AsciiAnimation scene={sceneMap[job.status] || "idle"} width="150px" height="110px" variant={isDark ? "dark" : "light"} />
      </div>
    </div>
  );
}
