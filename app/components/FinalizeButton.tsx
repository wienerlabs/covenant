"use client";

import { useState } from "react";

interface FinalizeButtonProps {
  jobId: string;
  callerWallet?: string;
  /** Only enable after the challenge period has expired. */
  enabled: boolean;
  variant?: "light" | "dark";
  onFinalized?: (result: unknown) => void;
}

/**
 * Finalize-payment button. Calls POST /api/jobs/[id]/finalize which in
 * turn releases escrow to the taker. Permissionless — anyone can press it
 * after the challenge period closes, though in practice either the taker,
 * the poster, or the /api/cron/finalize worker does.
 */
export default function FinalizeButton({
  jobId,
  callerWallet,
  enabled,
  variant = "light",
  onFinalized,
}: FinalizeButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isDark = variant === "dark";

  async function handleFinalize() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/finalize`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ callerWallet: callerWallet ?? "anonymous" }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setSuccess(true);
      onFinalized?.(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const baseStyle: React.CSSProperties = {
    fontFamily: "inherit",
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    padding: "12px 28px",
    borderRadius: "8px",
    cursor: enabled && !loading ? "pointer" : "not-allowed",
    transition: "all 0.15s ease",
    border: "1px solid",
    fontWeight: 700,
  };

  if (success) {
    return (
      <div
        style={{
          ...baseStyle,
          borderColor: "#1E9E5F",
          backgroundColor: "rgba(30,158,95,0.12)",
          color: "#1E9E5F",
          cursor: "default",
          textAlign: "center",
        }}
      >
        Payment finalized
      </div>
    );
  }

  if (!enabled) {
    return (
      <div
        style={{
          ...baseStyle,
          borderColor: isDark
            ? "rgba(255,255,255,0.12)"
            : "rgba(0,0,0,0.12)",
          backgroundColor: "transparent",
          color: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)",
          textAlign: "center",
        }}
        title="Finalize will be enabled once the challenge period expires"
      >
        Finalize Payment
      </div>
    );
  }

  return (
    <button
      onClick={handleFinalize}
      disabled={loading}
      style={{
        ...baseStyle,
        borderColor: "#1E9E5F",
        backgroundColor: loading ? "rgba(30,158,95,0.05)" : "rgba(30,158,95,0.1)",
        color: "#1E9E5F",
      }}
    >
      {loading ? "Finalizing..." : "Finalize Payment"}
      {error && (
        <div
          style={{
            marginTop: "6px",
            fontSize: "10px",
            color: "#FF425E",
            textTransform: "none",
          }}
        >
          {error}
        </div>
      )}
    </button>
  );
}
