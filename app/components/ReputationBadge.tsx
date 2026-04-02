"use client";

import useReputation from "@/hooks/useReputation";
import { USDC_LOGO_URL } from "@/lib/constants";

interface ReputationBadgeProps {
  wallet?: string | null;
  completed?: number;
  failed?: number;
  totalEarned?: number;
}

export default function ReputationBadge({
  wallet,
  completed: completedProp,
  failed: failedProp,
  totalEarned: totalEarnedProp,
}: ReputationBadgeProps) {
  const { reputation, loading } = useReputation(wallet);

  const completed = completedProp ?? reputation.jobsCompleted;
  const failed = failedProp ?? reputation.jobsFailed;
  const totalEarned = totalEarnedProp ?? reputation.totalEarned;

  if (loading && wallet) {
    return (
      <div
        style={{
          border: "1px solid #e0e0e0",
          borderRadius: "8px",
          padding: "12px",
          fontSize: "11px",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "#999",
          textAlign: "center",
        }}
      >
        Loading...
      </div>
    );
  }

  const hasHistory = completed > 0 || failed > 0 || totalEarned > 0;

  if (!hasHistory) {
    return (
      <div
        style={{
          border: "1px solid #e0e0e0",
          borderRadius: "8px",
          padding: "12px",
          fontSize: "11px",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "#999",
          textAlign: "center",
        }}
      >
        No History
      </div>
    );
  }

  const segmentStyle: React.CSSProperties = {
    flex: 1,
    textAlign: "center",
    padding: "4px 0",
  };

  const dividerStyle: React.CSSProperties = {
    width: "1px",
    backgroundColor: "rgba(255,255,255,0.15)",
    alignSelf: "stretch",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "9px",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: "rgba(255,255,255,0.5)",
    marginBottom: "2px",
  };

  const valueStyle: React.CSSProperties = {
    fontSize: "14px",
    fontWeight: 600,
    color: "#ffffff",
  };

  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.2)",
        borderRadius: "8px",
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        backgroundColor: "rgba(255,255,255,0.05)",
      }}
    >
      <div style={segmentStyle}>
        <div style={labelStyle}>Completed</div>
        <div style={valueStyle}>{completed}</div>
      </div>
      <div style={dividerStyle} />
      <div style={segmentStyle}>
        <div style={labelStyle}>Failed</div>
        <div style={valueStyle}>{failed}</div>
      </div>
      <div style={dividerStyle} />
      <div style={segmentStyle}>
        <div style={labelStyle}>Earned</div>
        <div style={{ ...valueStyle, display: "flex", alignItems: "center", gap: "4px", justifyContent: "center" }}>
          <img src={USDC_LOGO_URL} alt="USDC" width={14} height={14} style={{ borderRadius: "50%" }} />
          {totalEarned.toFixed(2)}
        </div>
      </div>
    </div>
  );
}
