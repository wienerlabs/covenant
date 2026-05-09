"use client";

import { useState } from "react";
import { useConnector } from "@solana/connector/react";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { triggerBalanceRefresh } from "@/lib/balance-bus";
import { USDC_DECIMALS, USDC_MINT } from "@/lib/constants";
import { getAnchorProgram, createJobOnChain } from "@/lib/anchor-browser";
import { buildJobSpec, hashJobSpecBytes } from "@/lib/spec";
import { usdcToAtomic } from "@/lib/token-math";

interface HireModalProps {
  open: boolean;
  onClose: () => void;
  agentName: string;
  agentType: string;
  specialty: string;
  suggestedPrice: number;
  category: string;
  onJobCreated?: (jobId: string) => void;
}

const CATEGORY_MAP: Record<string, string> = {
  writer: "text_writing",
  reviewer: "code_review",
  translator: "translation",
  labeler: "data_labeling",
  auditor: "bug_bounty",
  designer: "design",
};

const PLACEHOLDER_MAP: Record<string, { title: string; desc: string; reqs: string }> = {
  writer: {
    title: "e.g. Blog post about AI agent payments",
    desc: "Describe exactly what you need written. Topic, tone, target audience...",
    reqs: "e.g. SEO optimized, include examples, professional tone",
  },
  reviewer: {
    title: "e.g. Security review of my Anchor program",
    desc: "Paste code or describe the repo/contract to review...",
    reqs: "e.g. Focus on reentrancy, access control, overflow",
  },
  translator: {
    title: "e.g. Translate product docs to Spanish",
    desc: "Paste the text to translate or describe the scope...",
    reqs: "e.g. Target language: Spanish, preserve technical terms",
  },
  labeler: {
    title: "e.g. Sentiment analysis of 100 user reviews",
    desc: "Describe the dataset and labeling categories...",
    reqs: "e.g. Categories: positive, negative, neutral. Output as JSON",
  },
  auditor: {
    title: "e.g. Smart contract vulnerability assessment",
    desc: "Paste the code or describe the target...",
    reqs: "e.g. Check OWASP top 10, provide PoC for findings",
  },
  designer: {
    title: "e.g. Landing page hero illustration",
    desc: "Describe the visual you need. Style, colors, mood...",
    reqs: "e.g. Pixel art style, dark background, yellow accents",
  },
};

export default function HireModal({
  open,
  onClose,
  agentName,
  agentType,
  specialty,
  suggestedPrice,
  onJobCreated,
}: HireModalProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connector = useConnector() as any;
  const account = connector.account as string | undefined;
  const selectedWallet = connector.selectedWallet;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [requirements, setRequirements] = useState("");
  const [amount, setAmount] = useState(suggestedPrice);
  const [deadline, setDeadline] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"form" | "signing" | "done">("form");
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const placeholders = PLACEHOLDER_MAP[agentType] || PLACEHOLDER_MAP.writer;
  const category = CATEGORY_MAP[agentType] || "text_writing";

  if (!open) return null;

  async function handleSubmit() {
    if (!account) {
      setError("Connect your wallet first");
      return;
    }
    if (!title.trim() || !description.trim()) {
      setError("Title and description are required");
      return;
    }
    if (amount <= 0) {
      setError("Budget must be greater than 0");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const deadlineDate = deadline
        ? new Date(deadline)
        : new Date(Date.now() + 24 * 60 * 60 * 1000);
      const deadlineIso = deadlineDate.toISOString();
      const createdAt = new Date().toISOString();
      const minWordsValue = category === "design" ? 0 : 100;

      // 1. Build the canonical spec — both client + server hash the same shape.
      setStep("signing");
      const specJson = buildJobSpec({
        posterWallet: account,
        amount,
        minWords: minWordsValue,
        language: "English",
        deadline: deadlineIso,
        createdAt,
        title: title.trim(),
        description: description.trim(),
        requirements: requirements.trim(),
      });
      const specHash = await hashJobSpecBytes(specJson);

      const program = getAnchorProgram(account, selectedWallet);
      if (!program) {
        setError("Wallet not ready — reconnect and try again.");
        setStep("form");
        setLoading(false);
        return;
      }

      const posterPk = new PublicKey(account);
      const posterTokenAccount = await getAssociatedTokenAddress(USDC_MINT, posterPk);
      const deadlineUnix = Math.floor(deadlineDate.getTime() / 1000);
      const amountAtomic = usdcToAtomic(amount);

      let escrowTxHash: string | undefined;
      let escrowAtaStr: string | undefined;
      let demoMode = false;
      try {
        const result = await createJobOnChain({
          program,
          poster: posterPk,
          specHash,
          amount: amountAtomic,
          deadline: new BN(deadlineUnix),
          challengePeriod: new BN(3600),
          posterTokenAccount,
          tokenMint: USDC_MINT,
        });
        escrowTxHash = result.sig;
        escrowAtaStr = result.escrowTokenAccount.toBase58();
      } catch (onchainErr) {
        // eslint-disable-next-line no-console
        console.warn(
          "[hire] on-chain create_job failed, falling back to demo mode:",
          onchainErr,
        );
        demoMode = true;
      }

      // 2. Mirror to server. /api/jobs verifies the on-chain Job PDA matches.
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posterWallet: account,
          amount,
          minWords: minWordsValue,
          language: "en",
          deadline: deadlineIso,
          createdAt,
          category,
          paymentToken: "USDC",
          title: title.trim(),
          description: description.trim(),
          requirements: requirements.trim(),
          escrowTxHash,
          escrowAta: escrowAtaStr,
          demoMode,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to create job");
      }

      const job = await res.json();
      const newJobId = job.id || job.jobId;
      setJobId(newJobId);

      // 3. Auto-accept on behalf of the agent
      try {
        await fetch(`/api/jobs/${newJobId}/accept`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            takerWallet: `covenant-agent-${agentType}`,
          }),
        });
      } catch {
        // Non-blocking
      }

      triggerBalanceRefresh();

      // 4. Trigger agent to actually do the work.
      // Fire the request BEFORE redirect so it's in-flight when
      // the page navigates. Use sendBeacon as fallback if available.
      const fulfillBody = JSON.stringify({
        jobId: newJobId,
        agentType,
        title: title.trim(),
        description: description.trim(),
        requirements: requirements.trim(),
        category,
      });

      // Try sendBeacon first (survives page navigation)
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/agents/fulfill",
          new Blob([fulfillBody], { type: "application/json" }),
        );
      } else {
        // Fallback: fire-and-forget fetch
        fetch("/api/agents/fulfill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: fulfillBody,
          keepalive: true,
        }).catch(() => {});
      }

      // Small delay to let the request start before navigation
      await new Promise((r) => setTimeout(r, 100));

      // Redirect to job detail page
      window.location.href = `/job/${newJobId}`;
      onJobCreated?.(newJobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create job");
      setStep("form");
    } finally {
      setLoading(false);
    }
  }

  const overlay: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.8)",
    zIndex: 2000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
  };

  const sheet: React.CSSProperties = {
    width: "100%",
    maxWidth: "520px",
    maxHeight: "92vh",
    overflowY: "auto",
    backgroundColor: "#0e0e12",
    border: "1px solid rgba(255,254,178,0.15)",
    borderRadius: "12px",
    padding: "28px",
    color: "#ffffff",
    display: "flex",
    flexDirection: "column",
    gap: "18px",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "6px",
    border: "1px solid rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.03)",
    color: "#ffffff",
    fontFamily: "inherit",
    fontSize: "13px",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "10px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "rgba(255,255,255,0.5)",
    marginBottom: "6px",
    display: "block",
  };

  // ---- Done state ----
  if (step === "done" && jobId) {
    return (
      <div style={overlay} onClick={onClose}>
        <div style={sheet} onClick={(e) => e.stopPropagation()}>
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>
              {"\u2713"}
            </div>
            <h2 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 8px" }}>
              Job Created
            </h2>
            <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", margin: "0 0 20px", lineHeight: 1.5 }}>
              {agentName} has been notified and will start working on your task.
              You can track progress on the job detail page.
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
              <a
                href={`/job/${jobId}`}
                style={{
                  padding: "10px 24px",
                  borderRadius: "6px",
                  border: "1px solid #fffeb2",
                  backgroundColor: "#fffeb2",
                  color: "#000",
                  fontSize: "12px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  fontFamily: "inherit",
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                View Job
              </a>
              <button
                onClick={onClose}
                style={{
                  padding: "10px 24px",
                  borderRadius: "6px",
                  border: "1px solid rgba(255,255,255,0.2)",
                  backgroundColor: "transparent",
                  color: "#fff",
                  fontSize: "12px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  fontFamily: "inherit",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Form state ----
  return (
    <div style={overlay} onClick={onClose}>
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div>
          <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em", color: "#fffeb2", marginBottom: "6px" }}>
            Hire {agentName}
          </div>
          <h2 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>
            Describe your task
          </h2>
          <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", margin: "6px 0 0", lineHeight: 1.5 }}>
            {specialty} agent. Tell them exactly what you need.
            They will accept your job and deliver the work.
          </p>
        </div>

        {/* Title */}
        <label>
          <span style={labelStyle}>Job title</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={placeholders.title}
            style={inputStyle}
          />
        </label>

        {/* Description */}
        <label>
          <span style={labelStyle}>What do you need?</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={placeholders.desc}
            rows={5}
            style={{ ...inputStyle, resize: "vertical", minHeight: "100px" }}
          />
        </label>

        {/* Requirements */}
        <label>
          <span style={labelStyle}>Requirements (optional)</span>
          <input
            type="text"
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            placeholder={placeholders.reqs}
            style={inputStyle}
          />
        </label>

        {/* Budget + Deadline */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <label>
            <span style={labelStyle}>Budget (USDC)</span>
            <input
              type="number"
              value={amount}
              min={1}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              style={{ ...inputStyle, fontFamily: "ui-monospace, monospace" }}
            />
          </label>
          <label>
            <span style={labelStyle}>Deadline</span>
            <input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              style={inputStyle}
            />
          </label>
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: "10px 12px", borderRadius: "6px", backgroundColor: "rgba(255,68,68,0.1)", color: "#FF4444", fontSize: "12px" }}>
            {error}
          </div>
        )}

        {/* Signing state */}
        {step === "signing" && (
          <div style={{ padding: "10px 12px", borderRadius: "6px", backgroundColor: "rgba(255,254,178,0.08)", color: "#fffeb2", fontSize: "12px" }}>
            Approve the escrow lock in your wallet...
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              flex: 1, padding: "12px", borderRadius: "6px",
              border: "1px solid rgba(255,255,255,0.15)",
              backgroundColor: "transparent", color: "#fff",
              fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em",
              fontFamily: "inherit", cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !title.trim() || !description.trim()}
            style={{
              flex: 1, padding: "12px", borderRadius: "6px",
              border: "1px solid #fffeb2",
              backgroundColor: loading ? "rgba(255,254,178,0.1)" : "#fffeb2",
              color: loading ? "#fffeb2" : "#000",
              fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em",
              fontFamily: "inherit", fontWeight: 700,
              cursor: loading || !title.trim() || !description.trim() ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Creating..." : `Create Job & Hire - $${amount}`}
          </button>
        </div>
      </div>
    </div>
  );
}
