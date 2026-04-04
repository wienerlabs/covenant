"use client";

import { useState, useEffect, useRef } from "react";
import type { TxStatus } from "@/lib/txConfirmation";

interface TxConfirmationProps {
  status: TxStatus;
  txHash?: string;
  onDismiss: () => void;
}

export default function TxConfirmation({ status, txHash, onDismiss }: TxConfirmationProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status === "confirmed") {
      timerRef.current = setTimeout(onDismiss, 3000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [status, onDismiss]);

  const statusConfig: Record<TxStatus, { label: string; color: string; icon: string }> = {
    signing: { label: "SIGNING...", color: "#f59e0b", icon: "\u270D" },
    confirming: { label: "CONFIRMING...", color: "#3b82f6", icon: "\u23F3" },
    confirmed: { label: "CONFIRMED", color: "#10b981", icon: "\u2713" },
    error: { label: "FAILED", color: "#ef4444", icon: "\u2717" },
  };

  const cfg = statusConfig[status];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(8px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && (status === "confirmed" || status === "error")) {
          onDismiss();
        }
      }}
    >
      <div
        style={{
          backgroundColor: "rgba(15,15,25,0.95)",
          border: `1px solid ${cfg.color}40`,
          borderRadius: "16px",
          padding: "32px 48px",
          textAlign: "center",
          minWidth: "280px",
          backdropFilter: "blur(16px)",
        }}
      >
        <div
          style={{
            fontSize: "32px",
            marginBottom: "12px",
            animation: status === "signing" || status === "confirming" ? "tx-pulse 1.5s ease-in-out infinite" : undefined,
          }}
        >
          {cfg.icon}
        </div>
        <style>{`
          @keyframes tx-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
          @keyframes tx-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
        <div
          style={{
            fontSize: "14px",
            fontWeight: 700,
            color: cfg.color,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: "8px",
          }}
        >
          {cfg.label}
        </div>
        {txHash && (
          <a
            href={`https://explorer.solana.com/tx/${txHash}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: "10px",
              color: "rgba(255,255,255,0.5)",
              textDecoration: "none",
              fontFamily: "monospace",
            }}
          >
            {txHash.slice(0, 16)}...{txHash.slice(-8)}
          </a>
        )}
      </div>
    </div>
  );
}
