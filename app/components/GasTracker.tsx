"use client";

import { useState, useEffect } from "react";
import { SOL_LOGO_URL } from "@/lib/constants";

interface GasTrackerProps {
  variant?: "inline" | "card";
}

export default function GasTracker({ variant = "inline" }: GasTrackerProps) {
  const [totalTxFees, setTotalTxFees] = useState<number | null>(null);

  useEffect(() => {
    async function fetchFees() {
      try {
        const res = await fetch("/api/stats");
        if (res.ok) {
          const data = await res.json();
          setTotalTxFees(data.totalTxFees ?? 0);
        }
      } catch {
        // silently fail
      }
    }
    fetchFees();
    const interval = setInterval(fetchFees, 15000);
    return () => clearInterval(interval);
  }, []);

  if (totalTxFees === null) return null;

  if (variant === "card") {
    return (
      <div
        style={{
          backgroundColor: "rgba(0,0,0,0.4)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "10px",
          padding: "12px 16px",
          backdropFilter: "blur(12px)",
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <img src={SOL_LOGO_URL} alt="SOL" width={16} height={16} style={{ borderRadius: "50%" }} />
        <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Protocol Gas:
        </span>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#fff", fontFamily: "monospace" }}>
          {totalTxFees.toFixed(6)} SOL
        </span>
      </div>
    );
  }

  // Inline variant
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
      <img src={SOL_LOGO_URL} alt="SOL" width={14} height={14} style={{ borderRadius: "50%" }} />
      <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Gas:
      </span>
      <span style={{ fontSize: "12px", fontWeight: 600, color: "#fff", fontFamily: "monospace" }}>
        {totalTxFees.toFixed(6)} SOL
      </span>
    </div>
  );
}
