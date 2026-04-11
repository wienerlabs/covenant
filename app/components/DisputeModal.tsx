"use client";

import { useState } from "react";

interface DisputeModalProps {
  open: boolean;
  onClose: () => void;
  jobId: string;
  posterWallet: string;
  escrowAmount: number;
  minBond: number;
  variant?: "light" | "dark";
  onRaised?: (dispute: unknown) => void;
}

/**
 * Modal for raising a dispute on a Delivered job. The poster enters a
 * reason text and confirms the bond. The server hashes the reason for
 * the on-chain commitment and records the text off-chain.
 *
 * A production client should also call `raise_dispute` on-chain via
 * the wallet before (or alongside) this POST; for the v1 hackathon flow
 * the server-side bookkeeping is enough to drive the demo.
 */
export default function DisputeModal({
  open,
  onClose,
  jobId,
  posterWallet,
  escrowAmount,
  minBond,
  variant = "light",
  onRaised,
}: DisputeModalProps) {
  const [reason, setReason] = useState("");
  const [bond, setBond] = useState(minBond);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDark = variant === "dark";

  if (!open) return null;

  async function handleSubmit() {
    if (reason.trim().length < 10) {
      setError("Please describe the issue in at least 10 characters");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/dispute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          posterWallet,
          reasonText: reason,
          bond,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      onRaised?.(body.dispute);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const overlay: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    zIndex: 2000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
  };

  const sheet: React.CSSProperties = {
    width: "100%",
    maxWidth: "480px",
    backgroundColor: isDark ? "#0e0e12" : "#ffffff",
    border: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid #e0e0e0",
    borderRadius: "12px",
    padding: "24px",
    color: isDark ? "#ffffff" : "#000000",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  };

  const bondPercent = escrowAmount > 0 ? ((bond / escrowAmount) * 100).toFixed(1) : "0";

  return (
    <div style={overlay} onClick={onClose}>
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        <div>
          <div
            style={{
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "#FF425E",
              marginBottom: "6px",
            }}
          >
            Raise Dispute
          </div>
          <h2 style={{ fontSize: "20px", fontWeight: 700, margin: 0 }}>
            Challenge this delivery
          </h2>
          <p
            style={{
              fontSize: "12px",
              color: isDark ? "rgba(255,255,255,0.5)" : "#666",
              margin: "8px 0 0",
              lineHeight: 1.5,
            }}
          >
            You have until the challenge period ends to dispute this delivery.
            A bond of {bond} USDC ({bondPercent}% of the {escrowAmount} USDC
            escrow) is held until an arbitrator resolves the dispute. Honest
            disputes are refunded; frivolous disputes forfeit the bond.
          </p>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span
            style={{
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: isDark ? "rgba(255,255,255,0.5)" : "#666",
            }}
          >
            Reason
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={5}
            placeholder="e.g. Delivery does not meet the spec's minimum word count / content is off-topic / hash does not match claimed output."
            style={{
              padding: "10px 12px",
              borderRadius: "6px",
              border: isDark ? "1px solid rgba(255,255,255,0.15)" : "1px solid #d0d0d0",
              backgroundColor: isDark ? "rgba(255,255,255,0.02)" : "#fafafa",
              color: "inherit",
              fontFamily: "inherit",
              fontSize: "13px",
              resize: "vertical",
            }}
          />
          <span
            style={{
              fontSize: "10px",
              color: isDark ? "rgba(255,255,255,0.3)" : "#999",
            }}
          >
            This reason is hashed on-chain (SHA-256) and stored off-chain for
            the arbitrator to read.
          </span>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span
            style={{
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: isDark ? "rgba(255,255,255,0.5)" : "#666",
            }}
          >
            Bond (USDC)
          </span>
          <input
            type="number"
            value={bond}
            min={minBond}
            step={0.1}
            onChange={(e) => setBond(Math.max(minBond, parseFloat(e.target.value) || minBond))}
            style={{
              padding: "10px 12px",
              borderRadius: "6px",
              border: isDark ? "1px solid rgba(255,255,255,0.15)" : "1px solid #d0d0d0",
              backgroundColor: isDark ? "rgba(255,255,255,0.02)" : "#fafafa",
              color: "inherit",
              fontFamily: "ui-monospace, monospace",
              fontSize: "14px",
            }}
          />
          <span
            style={{
              fontSize: "10px",
              color: isDark ? "rgba(255,255,255,0.3)" : "#999",
            }}
          >
            Minimum: {minBond} USDC (max of 10% of escrow or 1 USDC absolute).
          </span>
        </label>

        {error && (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: "6px",
              backgroundColor: "rgba(255,66,94,0.1)",
              color: "#FF425E",
              fontSize: "12px",
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: "6px",
              border: isDark ? "1px solid rgba(255,255,255,0.15)" : "1px solid #d0d0d0",
              backgroundColor: "transparent",
              color: "inherit",
              fontSize: "12px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontFamily: "inherit",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: "6px",
              border: "1px solid #FF425E",
              backgroundColor: "rgba(255,66,94,0.1)",
              color: "#FF425E",
              fontSize: "12px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontFamily: "inherit",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
          >
            {loading ? "Raising..." : "Raise Dispute"}
          </button>
        </div>
      </div>
    </div>
  );
}
