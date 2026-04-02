"use client";

import { useState } from "react";
import { useConnector } from "@solana/connector/react";
import { JOB_CATEGORIES, type CategoryId } from "@/lib/categories";
import { USDC_LOGO_URL, SOL_LOGO_URL } from "@/lib/constants";

interface JobWizardProps {
  onComplete?: (data: Record<string, unknown>) => void;
  variant?: "light" | "dark";
}

interface WizardData {
  category: CategoryId | null;
  amount: number;
  paymentToken: "USDC" | "SOL";
  minWords: number;
  deadline: string;
}

export default function JobWizard({ onComplete, variant = "dark" }: JobWizardProps) {
  const isDark = variant === "dark";
  const { account } = useConnector();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>({
    category: null,
    amount: 25,
    paymentToken: "USDC",
    minWords: 200,
    deadline: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ jobId: string; txHash: string | null } | null>(null);

  const cardBg = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.03)";
  const cardBorder = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)";
  const textColor = isDark ? "#ffffff" : "#000000";
  const mutedText = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";

  const glassCard: React.CSSProperties = {
    backgroundColor: cardBg,
    backdropFilter: "blur(16px)",
    border: `1px solid ${cardBorder}`,
    borderRadius: "12px",
    padding: "24px",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "10px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: mutedText,
    marginBottom: "8px",
    display: "block",
    fontWeight: 600,
  };

  function handleCategorySelect(id: CategoryId) {
    setData((prev) => ({ ...prev, category: id }));
  }

  async function handleSubmit() {
    if (!account || !data.category) return;
    setSubmitting(true);
    setError(null);

    try {
      const deadlineDate = data.deadline
        ? new Date(data.deadline)
        : new Date(Date.now() + 24 * 60 * 60 * 1000);

      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posterWallet: account,
          category: data.category,
          amount: data.amount,
          paymentToken: data.paymentToken,
          minWords: data.minWords,
          deadline: deadlineDate.toISOString(),
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Failed to create job");
        return;
      }

      const jobResult = await res.json();
      setResult({ jobId: jobResult.id || jobResult.jobId, txHash: jobResult.txHash || null });
      setStep(4);
      if (onComplete) onComplete(jobResult);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Step dots
  function renderStepDots() {
    return (
      <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginBottom: "20px" }}>
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: s === step ? textColor : `${mutedText}40`,
              transition: "all 0.3s ease",
            }}
          />
        ))}
      </div>
    );
  }

  // Navigation
  function renderNav() {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "20px" }}>
        {step > 1 && step < 4 ? (
          <button
            onClick={() => setStep((s) => s - 1)}
            style={{
              fontFamily: "inherit",
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              padding: "8px 20px",
              cursor: "pointer",
              border: `1px solid ${cardBorder}`,
              borderRadius: "6px",
              backgroundColor: "transparent",
              color: mutedText,
              transition: "all 0.15s ease",
            }}
          >
            Back
          </button>
        ) : (
          <div />
        )}
        {step < 3 && (
          <button
            onClick={() => {
              if (step === 1 && !data.category) return;
              setStep((s) => s + 1);
            }}
            disabled={step === 1 && !data.category}
            style={{
              fontFamily: "inherit",
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              padding: "8px 20px",
              cursor: step === 1 && !data.category ? "not-allowed" : "pointer",
              border: `1px solid ${textColor}`,
              borderRadius: "6px",
              backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
              color: textColor,
              fontWeight: 600,
              transition: "all 0.15s ease",
              opacity: step === 1 && !data.category ? 0.4 : 1,
            }}
          >
            Next
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      {renderStepDots()}

      {/* Step 1: Choose Category */}
      {step === 1 && (
        <div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: textColor, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: "16px", textAlign: "center" }}>
            Choose Category
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
            {JOB_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleCategorySelect(cat.id)}
                style={{
                  ...glassCard,
                  cursor: "pointer",
                  textAlign: "center",
                  borderColor: data.category === cat.id ? textColor : cardBorder,
                  backgroundColor: data.category === cat.id ? (isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)") : cardBg,
                  transition: "all 0.2s ease",
                  fontFamily: "inherit",
                }}
              >
                <div style={{ fontSize: "18px", marginBottom: "6px" }}>{cat.tag}</div>
                <div style={{ fontSize: "11px", fontWeight: 600, color: textColor, marginBottom: "4px" }}>{cat.label}</div>
                <div style={{ fontSize: "9px", color: mutedText, lineHeight: 1.4 }}>{cat.description}</div>
              </button>
            ))}
          </div>
          {renderNav()}
        </div>
      )}

      {/* Step 2: Set Details */}
      {step === 2 && (
        <div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: textColor, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: "16px", textAlign: "center" }}>
            Set Details
          </div>
          <div style={{ ...glassCard, display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Amount */}
            <div>
              <label style={labelStyle}>
                Amount ({data.paymentToken})
              </label>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={data.amount}
                  onChange={(e) => setData((d) => ({ ...d, amount: parseInt(e.target.value) }))}
                  style={{ flex: 1, accentColor: isDark ? "#ffffff" : "#000000" }}
                />
                <input
                  type="number"
                  value={data.amount}
                  onChange={(e) => setData((d) => ({ ...d, amount: parseInt(e.target.value) || 1 }))}
                  min={1}
                  max={100}
                  style={{
                    width: "60px",
                    padding: "6px 8px",
                    fontSize: "13px",
                    fontFamily: "inherit",
                    borderRadius: "6px",
                    border: `1px solid ${cardBorder}`,
                    backgroundColor: cardBg,
                    color: textColor,
                    outline: "none",
                    textAlign: "center",
                  }}
                />
              </div>
              <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
                {(["USDC", "SOL"] as const).map((token) => (
                  <button
                    key={token}
                    onClick={() => setData((d) => ({ ...d, paymentToken: token }))}
                    style={{
                      fontFamily: "inherit",
                      fontSize: "10px",
                      padding: "4px 12px",
                      cursor: "pointer",
                      border: `1px solid ${data.paymentToken === token ? textColor : cardBorder}`,
                      borderRadius: "4px",
                      backgroundColor: data.paymentToken === token ? (isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)") : "transparent",
                      color: data.paymentToken === token ? textColor : mutedText,
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <img
                      src={token === "USDC" ? USDC_LOGO_URL : SOL_LOGO_URL}
                      alt={token}
                      width={12}
                      height={12}
                      style={{ borderRadius: "50%" }}
                    />
                    {token}
                  </button>
                ))}
              </div>
            </div>

            {/* Min Words */}
            <div>
              <label style={labelStyle}>Min Words</label>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="range"
                  min={50}
                  max={1000}
                  step={10}
                  value={data.minWords}
                  onChange={(e) => setData((d) => ({ ...d, minWords: parseInt(e.target.value) }))}
                  style={{ flex: 1, accentColor: isDark ? "#ffffff" : "#000000" }}
                />
                <input
                  type="number"
                  value={data.minWords}
                  onChange={(e) => setData((d) => ({ ...d, minWords: parseInt(e.target.value) || 50 }))}
                  min={50}
                  max={1000}
                  style={{
                    width: "60px",
                    padding: "6px 8px",
                    fontSize: "13px",
                    fontFamily: "inherit",
                    borderRadius: "6px",
                    border: `1px solid ${cardBorder}`,
                    backgroundColor: cardBg,
                    color: textColor,
                    outline: "none",
                    textAlign: "center",
                  }}
                />
              </div>
            </div>

            {/* Deadline */}
            <div>
              <label style={labelStyle}>Deadline</label>
              <input
                type="datetime-local"
                value={data.deadline}
                onChange={(e) => setData((d) => ({ ...d, deadline: e.target.value }))}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: "13px",
                  fontFamily: "inherit",
                  borderRadius: "6px",
                  border: `1px solid ${cardBorder}`,
                  backgroundColor: cardBg,
                  color: textColor,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>
          {renderNav()}
        </div>
      )}

      {/* Step 3: Preview & Lock */}
      {step === 3 && (
        <div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: textColor, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: "16px", textAlign: "center" }}>
            Preview & Lock
          </div>
          <div style={glassCard}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
              <div>
                <div style={labelStyle}>Category</div>
                <div style={{ fontSize: "13px", color: textColor, fontWeight: 600 }}>
                  {data.category ? JOB_CATEGORIES.find((c) => c.id === data.category)?.label || data.category : "None"}
                </div>
              </div>
              <div>
                <div style={labelStyle}>Amount</div>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <img
                    src={data.paymentToken === "USDC" ? USDC_LOGO_URL : SOL_LOGO_URL}
                    alt={data.paymentToken}
                    width={16}
                    height={16}
                    style={{ borderRadius: "50%" }}
                  />
                  <span style={{ fontSize: "18px", fontWeight: 700, color: textColor }}>
                    {data.amount}
                  </span>
                  <span style={{ fontSize: "11px", color: mutedText }}>{data.paymentToken}</span>
                </div>
              </div>
              <div>
                <div style={labelStyle}>Min Words</div>
                <div style={{ fontSize: "13px", color: textColor }}>{data.minWords}</div>
              </div>
              <div>
                <div style={labelStyle}>Deadline</div>
                <div style={{ fontSize: "13px", color: textColor }}>
                  {data.deadline ? new Date(data.deadline).toLocaleString() : "24 hours"}
                </div>
              </div>
            </div>

            {/* Animated coin visualization */}
            <div style={{ display: "flex", justifyContent: "center", padding: "12px 0", position: "relative" }}>
              <style>{`
                @keyframes wizard-coin-flow {
                  0% { transform: translateX(-40px); opacity: 0; }
                  30% { opacity: 1; }
                  70% { opacity: 1; }
                  100% { transform: translateX(40px); opacity: 0; }
                }
              `}</style>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "16px",
              }}>
                <div style={{ fontSize: "9px", textTransform: "uppercase", color: mutedText }}>WALLET</div>
                <div style={{ width: "80px", height: "2px", backgroundColor: `${mutedText}30`, position: "relative" }}>
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      style={{
                        position: "absolute",
                        top: "-2px",
                        left: "0",
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        backgroundColor: "#eab308",
                        animation: `wizard-coin-flow 1.5s ease-in-out ${i * 0.3}s infinite`,
                      }}
                    />
                  ))}
                </div>
                <div style={{ fontSize: "9px", textTransform: "uppercase", color: mutedText }}>ESCROW</div>
              </div>
            </div>

            {error && (
              <div style={{ fontSize: "11px", color: "#fca5a5", textAlign: "center", marginBottom: "8px" }}>
                {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting || !account}
              style={{
                width: "100%",
                fontFamily: "inherit",
                fontSize: "13px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                padding: "12px",
                cursor: submitting ? "wait" : "pointer",
                border: `1px solid ${textColor}`,
                borderRadius: "8px",
                backgroundColor: submitting ? cardBg : (isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)"),
                color: submitting ? mutedText : textColor,
                fontWeight: 600,
                transition: "all 0.2s ease",
                marginTop: "8px",
              }}
            >
              {submitting ? "Locking Payment..." : "Lock Payment"}
            </button>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-start", marginTop: "12px" }}>
            <button
              onClick={() => setStep(2)}
              style={{
                fontFamily: "inherit",
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                padding: "8px 20px",
                cursor: "pointer",
                border: `1px solid ${cardBorder}`,
                borderRadius: "6px",
                backgroundColor: "transparent",
                color: mutedText,
                transition: "all 0.15s ease",
              }}
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Confirmed */}
      {step === 4 && result && (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "14px", fontWeight: 700, color: textColor, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: "16px" }}>
            Confirmed
          </div>
          <div style={glassCard}>
            {/* Checkmark animation */}
            <style>{`
              @keyframes wizard-check-scale {
                0% { transform: scale(0); opacity: 0; }
                60% { transform: scale(1.2); }
                100% { transform: scale(1); opacity: 1; }
              }
            `}</style>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                backgroundColor: "rgba(16,185,129,0.15)",
                border: "2px solid #10B981",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
                animation: "wizard-check-scale 0.5s ease-out",
              }}
            >
              <span style={{ fontSize: "24px", color: "#10B981" }}>&#10003;</span>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <div style={labelStyle}>Job ID</div>
              <div style={{ fontSize: "12px", fontFamily: "monospace", color: textColor, wordBreak: "break-all" }}>
                {result.jobId}
              </div>
            </div>

            {result.txHash && (
              <div style={{ marginBottom: "16px" }}>
                <div style={labelStyle}>Transaction</div>
                <a
                  href={`https://explorer.solana.com/tx/${result.txHash}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: "11px", color: "#5ba4f5", textDecoration: "none", fontFamily: "monospace" }}
                >
                  {result.txHash.slice(0, 20)}...
                </a>
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "16px" }}>
              <a
                href={`/job/${result.jobId}`}
                style={{
                  fontFamily: "inherit",
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  padding: "8px 20px",
                  border: `1px solid ${textColor}`,
                  borderRadius: "6px",
                  backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
                  color: textColor,
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                View Job
              </a>
              <button
                onClick={() => {
                  setStep(1);
                  setData({ category: null, amount: 25, paymentToken: "USDC", minWords: 200, deadline: "" });
                  setResult(null);
                  setError(null);
                }}
                style={{
                  fontFamily: "inherit",
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  padding: "8px 20px",
                  cursor: "pointer",
                  border: `1px solid ${cardBorder}`,
                  borderRadius: "6px",
                  backgroundColor: "transparent",
                  color: mutedText,
                  transition: "all 0.15s ease",
                }}
              >
                Create Another
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
