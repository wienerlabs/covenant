"use client";

import { useState } from "react";
import { useConnector } from "@solana/connector/react";
import {
  getAnchorProgram,
  finalizePaymentOnChain,
  PublicKey,
} from "@/lib/anchor-browser";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { USDC_MINT } from "@/lib/constants";
import { triggerBalanceRefresh } from "@/lib/balance-bus";

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connector = useConnector() as any;
  const selectedWallet = connector.selectedWallet;

  async function handleFinalize() {
    setLoading(true);
    setError(null);
    try {
      // Step 1: try on-chain finalize_payment (real Anchor instruction)
      let onChainSig: string | undefined;
      if (callerWallet && selectedWallet) {
        try {
          const program = getAnchorProgram(callerWallet, selectedWallet);
          if (program) {
            // Fetch job details for PDA derivation
            const jobRes = await fetch(`/api/jobs/${jobId}`);
            if (jobRes.ok) {
              const jobData = await jobRes.json();
              if (jobData.posterWallet && jobData.takerWallet && jobData.specHash) {
                const posterPk = new PublicKey(jobData.posterWallet);
                const takerPk = new PublicKey(jobData.takerWallet);
                const specHash = new Uint8Array(Buffer.from(jobData.specHash, "hex"));
                const takerAta = await getAssociatedTokenAddress(USDC_MINT, takerPk);
                // escrowTokenAccount — we'd need it from the job. If the job has pda
                // and escrow ATA stored, use those; otherwise fallback to server-side.
                // For now, try the on-chain call; if it fails, fallback to server.
                const crankPk = new PublicKey(callerWallet);

                // Try to get escrow token account from job events
                const escrowAta = jobData.delivery?.escrowAta
                  ? new PublicKey(jobData.delivery.escrowAta)
                  : undefined;

                if (escrowAta) {
                  onChainSig = await finalizePaymentOnChain({
                    program,
                    crank: crankPk,
                    poster: posterPk,
                    taker: takerPk,
                    specHash,
                    escrowTokenAccount: escrowAta,
                    takerTokenAccount: takerAta,
                  });
                }
              }
            }
          }
        } catch (anchorErr) {
          console.warn("[finalize] on-chain finalize_payment failed, falling back to server:", anchorErr);
        }
      }

      // Step 2: record on server (DB mirror + fallback release)
      const res = await fetch(`/api/jobs/${jobId}/finalize`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          callerWallet: callerWallet ?? "anonymous",
          onChainSig,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setSuccess(true);
      triggerBalanceRefresh();
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
