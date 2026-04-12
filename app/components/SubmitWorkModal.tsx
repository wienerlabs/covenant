"use client";

import { useState } from "react";
import { useConnector } from "@solana/connector/react";
import {
  getAnchorProgram,
  submitWorkOnChain,
  PublicKey,
} from "@/lib/anchor-browser";
import crypto from "crypto";

interface SubmitWorkModalProps {
  open: boolean;
  onClose: () => void;
  jobId: string;
  takerWallet: string;
  minWords: number;
  category?: string;
  variant?: "light" | "dark";
  onSubmitted?: (result: unknown) => void;
}

/**
 * Modal for submitting work (delivery commitment) to a job. The taker
 * pastes/writes their deliverable, we:
 *   1. POST /api/delivery/upload -> Vercel Blob -> { workHash, deliveryUri }
 *   2. POST /api/jobs/[id]/submit -> records Delivery, starts challenge period
 *
 * In production the client would also build and send a `submit_work` Anchor
 * transaction using the SDK; for the hackathon demo the server-side
 * bookkeeping and challenge countdown are enough to drive the UX.
 */
export default function SubmitWorkModal({
  open,
  onClose,
  jobId,
  takerWallet,
  minWords,
  category = "text_writing",
  variant = "light",
  onSubmitted,
}: SubmitWorkModalProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connector = useConnector() as any;
  const selectedWallet = connector.selectedWallet;

  const isDark = variant === "dark";
  const wordCount = content.trim().split(/\s+/).filter((w) => w.length > 0).length;

  if (!open) return null;

  async function handleSubmit() {
    if (wordCount < minWords) {
      setError(`Need at least ${minWords} words (have ${wordCount})`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Step 1: upload content to Vercel Blob
      setUploadProgress("Uploading delivery...");
      let deliveryUri: string | undefined;
      let workHash: string | undefined;
      try {
        const upRes = await fetch("/api/delivery/upload", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            content,
            filename: `covenant-${jobId.slice(0, 8)}.md`,
          }),
        });
        if (upRes.ok) {
          const upBody = await upRes.json();
          deliveryUri = upBody.deliveryUri;
          workHash = upBody.workHash;
        } else {
          console.warn("[submit-work] blob upload failed, falling back to inline");
        }
      } catch (upErr) {
        console.warn("[submit-work] blob upload error, falling back to inline:", upErr);
      }

      // Step 2: real submit_work instruction via Anchor
      // This calls the deployed program's submit_work instruction which:
      //   - Records work_hash + delivery_uri on the JobEscrow PDA
      //   - Transitions the job to Delivered state on chain
      //   - Starts the challenge period (challenge_end = now + period)
      let commitmentTxHash: string | undefined;
      try {
        setUploadProgress("Please sign the delivery commitment in your wallet...");
        const program = getAnchorProgram(takerWallet, selectedWallet);
        if (program) {
          // Fetch job details from API to get poster + specHash for PDA derivation
          const jobRes = await fetch(`/api/jobs/${jobId}`);
          if (jobRes.ok) {
            const jobData = await jobRes.json();
            const posterPk = new PublicKey(jobData.posterWallet);
            const specHashBytes = new Uint8Array(
              Buffer.from(jobData.specHash, "hex"),
            );
            const workHashBytes = new Uint8Array(
              crypto.createHash("sha256").update(content).digest(),
            );

            commitmentTxHash = await submitWorkOnChain({
              program,
              taker: new PublicKey(takerWallet),
              poster: posterPk,
              specHash: specHashBytes,
              workHash: workHashBytes,
              deliveryUri: deliveryUri ?? `inline:${jobId.slice(0, 8)}`,
            });
          }
        }
      } catch (submitErr) {
        // If the on-chain submit_work fails, fall back to off-chain
        // recording so the demo doesn't deadlock. Log the error.
        console.warn("[submit-work] on-chain submit_work failed:", submitErr);
      }

      // Step 3: server-side record
      setUploadProgress("Recording delivery...");
      const submitRes = await fetch(`/api/jobs/${jobId}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          takerWallet,
          text: content,
          deliveryUri,
          workHash,
          outputText: content,
          commitmentTxHash,
        }),
      });
      const submitBody = await submitRes.json();
      if (!submitRes.ok) {
        throw new Error(submitBody.error ?? `HTTP ${submitRes.status}`);
      }

      onSubmitted?.(submitBody);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setUploadProgress("");
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
    maxWidth: "640px",
    maxHeight: "92vh",
    overflowY: "auto",
    backgroundColor: isDark ? "#0e0e12" : "#ffffff",
    border: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid #e0e0e0",
    borderRadius: "12px",
    padding: "24px",
    color: isDark ? "#ffffff" : "#000000",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  };

  const wordCountColor =
    wordCount >= minWords
      ? "#1E9E5F"
      : isDark
        ? "rgba(255,255,255,0.5)"
        : "#666";

  return (
    <div style={overlay} onClick={onClose}>
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        <div>
          <div
            style={{
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "#fffeb2",
              marginBottom: "6px",
            }}
          >
            Submit Work
          </div>
          <h2 style={{ fontSize: "20px", fontWeight: 700, margin: 0 }}>
            Deliver your work
          </h2>
          <p
            style={{
              fontSize: "12px",
              color: isDark ? "rgba(255,255,255,0.5)" : "#666",
              margin: "8px 0 0",
              lineHeight: 1.5,
            }}
          >
            Your content is hashed (SHA-256) and uploaded to Vercel Blob. The
            commitment goes on-chain; the challenge period starts now and runs
            for {category === "text_writing" ? "24 hours" : "the configured window"}.
            If the poster doesn&apos;t dispute, payment auto-releases to your wallet.
          </p>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span
            style={{
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: isDark ? "rgba(255,255,255,0.5)" : "#666",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>Deliverable content</span>
            <span style={{ color: wordCountColor }}>
              {wordCount} / {minWords} words
            </span>
          </span>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={14}
            placeholder="Paste your completed work here..."
            style={{
              padding: "12px",
              borderRadius: "6px",
              border: isDark ? "1px solid rgba(255,255,255,0.15)" : "1px solid #d0d0d0",
              backgroundColor: isDark ? "rgba(255,255,255,0.02)" : "#fafafa",
              color: "inherit",
              fontFamily: "ui-monospace, monospace",
              fontSize: "13px",
              lineHeight: 1.6,
              resize: "vertical",
              minHeight: "200px",
            }}
          />
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
        {uploadProgress && !error && (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: "6px",
              backgroundColor: isDark ? "rgba(255,227,66,0.1)" : "rgba(255,227,66,0.15)",
              color: "#B38F00",
              fontSize: "12px",
            }}
          >
            {uploadProgress}
          </div>
        )}

        <div style={{ display: "flex", gap: "12px" }}>
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
            disabled={loading || wordCount < minWords}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: "6px",
              border: "1px solid #fffeb2",
              backgroundColor: "rgba(255,227,66,0.1)",
              color: "#fffeb2",
              fontSize: "12px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontFamily: "inherit",
              cursor:
                loading || wordCount < minWords ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
          >
            {loading ? "Submitting..." : "Submit & Start Challenge"}
          </button>
        </div>
      </div>
    </div>
  );
}
