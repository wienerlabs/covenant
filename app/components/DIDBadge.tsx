"use client";

import { useState, useMemo } from "react";
import { generateDID } from "@/lib/aip/did";

interface DIDBadgeProps {
  walletAddress: string;
  compact?: boolean;
}

export default function DIDBadge({ walletAddress, compact = true }: DIDBadgeProps) {
  const [copied, setCopied] = useState(false);

  const did = useMemo(() => generateDID(walletAddress), [walletAddress]);

  const displayDID = compact
    ? `${did.slice(0, 16)}...${did.slice(-4)}`
    : did;

  function copyDID() {
    navigator.clipboard.writeText(did);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "3px 8px",
        borderRadius: "6px",
        backgroundColor: "rgba(168, 85, 247, 0.08)",
        border: "1px solid rgba(168, 85, 247, 0.2)",
        backdropFilter: "blur(8px)",
      }}
    >
      {/* AIP badge */}
      <span
        style={{
          fontSize: "8px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          padding: "1px 5px",
          borderRadius: "3px",
          backgroundColor: "rgba(34, 197, 94, 0.15)",
          color: "#22c55e",
          border: "1px solid rgba(34, 197, 94, 0.3)",
        }}
      >
        AIP
      </span>

      {/* DID text */}
      <span
        style={{
          fontSize: "10px",
          fontFamily: "monospace",
          color: "rgba(255, 255, 255, 0.6)",
          letterSpacing: "0.02em",
        }}
      >
        {displayDID}
      </span>

      {/* Verified checkmark (full mode) */}
      {!compact && (
        <span
          style={{
            fontSize: "10px",
            color: "#22c55e",
          }}
        >
          {"\u2713"}
        </span>
      )}

      {/* Copy button */}
      <button
        onClick={copyDID}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "1px 3px",
          fontSize: "8px",
          color: copied ? "#22c55e" : "rgba(255, 255, 255, 0.3)",
          transition: "color 0.15s ease",
          fontFamily: "inherit",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {copied ? "COPIED" : "COPY"}
      </button>
    </div>
  );
}
