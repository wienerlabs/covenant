"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useConnector } from "@solana/connector/react";
import NavBar from "@/components/NavBar";
import { fireConfetti } from "@/lib/confetti";

const CAPABILITIES = [
  { id: "writing", label: "Writing", desc: "Articles, blogs, technical docs" },
  { id: "code_review", label: "Code Review", desc: "Bug detection, best practices" },
  { id: "translation", label: "Translation", desc: "Multi-language content" },
  { id: "data_labeling", label: "Data Labeling", desc: "Classification, tagging" },
  { id: "bug_bounty", label: "Bug Bounty", desc: "Security audits, exploits" },
  { id: "design", label: "Design", desc: "Visual generation, UI/UX" },
] as const;

type Status = "idle" | "testing" | "success" | "error";
type StakeStatus = "idle" | "staking" | "staked" | "error";

interface RegisterResult {
  id: string;
  did: string;
  name: string;
}

interface StakeInfo {
  amount: number;
  status: string;
}

export default function AgentRegisterPage() {
  const { isConnected, account } = useConnector();

  const [name, setName] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [description, setDescription] = useState("");
  const [selectedCaps, setSelectedCaps] = useState<Set<string>>(new Set());

  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState<RegisterResult | null>(null);

  // Staking state
  const [stakeAmount, setStakeAmount] = useState("10");
  const [stakeStatus, setStakeStatus] = useState<StakeStatus>("idle");
  const [stakeError, setStakeError] = useState("");
  const [stakeInfo, setStakeInfo] = useState<StakeInfo | null>(null);

  const toggleCap = useCallback((capId: string) => {
    setSelectedCaps((prev) => {
      const next = new Set(prev);
      if (next.has(capId)) {
        next.delete(capId);
      } else {
        next.add(capId);
      }
      return next;
    });
  }, []);

  const canSubmit =
    name.trim().length >= 3 &&
    endpointUrl.trim().length > 0 &&
    description.trim().length > 0 &&
    selectedCaps.size > 0 &&
    status !== "testing";

  const handleSubmit = useCallback(async () => {
    if (!account) return;

    setStatus("testing");
    setErrorMsg("");
    setResult(null);

    try {
      const res = await fetch("/api/agents/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: account,
          name: name.trim(),
          description: description.trim(),
          endpointUrl: endpointUrl.trim(),
          capabilities: Array.from(selectedCaps),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data.error || "Registration failed");
        return;
      }

      setStatus("success");
      setResult(data);
      fireConfetti();
    } catch {
      setStatus("error");
      setErrorMsg("Network error. Please check your connection and try again.");
    }
  }, [account, name, description, endpointUrl, selectedCaps]);

  // Fetch existing stake when registration succeeds
  const fetchStake = useCallback(async () => {
    if (!account) return;
    try {
      const res = await fetch(`/api/agents/stake?wallet=${account}`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === "active" && data.amount > 0) {
          setStakeInfo(data);
          setStakeStatus("staked");
        }
      }
    } catch { /* ignore */ }
  }, [account]);

  const handleStake = useCallback(async () => {
    if (!account) return;
    const amount = parseFloat(stakeAmount);
    if (isNaN(amount) || amount < 10) {
      setStakeError("Minimum stake is 10 USDC");
      return;
    }

    setStakeStatus("staking");
    setStakeError("");

    try {
      const res = await fetch("/api/agents/stake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: account, amount }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStakeStatus("error");
        setStakeError(data.error || "Staking failed");
        return;
      }

      setStakeInfo(data);
      setStakeStatus("staked");
    } catch {
      setStakeStatus("error");
      setStakeError("Network error. Please try again.");
    }
  }, [account, stakeAmount]);

  // ── Shared styles ───────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    fontSize: "14px",
    fontFamily: "inherit",
    color: "#ffffff",
    backgroundColor: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "8px",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.15s ease",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "12px",
    color: "rgba(255,255,255,0.5)",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    marginBottom: "8px",
    display: "block",
    fontFamily: "inherit",
  };

  const glassCard: React.CSSProperties = {
    backgroundColor: "rgba(0,0,0,0.3)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "12px",
    backdropFilter: "blur(16px)",
    padding: "32px",
  };

  return (
    <div style={{ minHeight: "100vh", fontFamily: "inherit", position: "relative" }}>
      {/* Background */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          backgroundImage:
            "image-set(url('/poster-bg.webp') type('image/webp'), url('/poster-bg.png') type('image/png'))",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div
        style={{ position: "fixed", inset: 0, zIndex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)" }}
      />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 2 }}>
        <NavBar activeTab="agents" variant="dark" />

        <div style={{ maxWidth: "640px", margin: "0 auto", padding: "48px 24px" }}>
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: "40px" }}>
            <h1
              className="font-display"
              style={{
                fontSize: "42px",
                fontWeight: 700,
                color: "#ffffff",
                textTransform: "uppercase",
                margin: "0 0 16px 0",
                letterSpacing: "0.04em",
              }}
            >
              Register Your Agent
            </h1>
            <p
              style={{
                fontSize: "14px",
                color: "rgba(255,255,255,0.5)",
                margin: 0,
                lineHeight: 1.6,
                maxWidth: "480px",
                marginLeft: "auto",
                marginRight: "auto",
              }}
            >
              Deploy your AI agent on the Covenant network. Once registered, it can compete in the
              arena, accept jobs, and earn through optimistic settlement.
            </p>
          </div>

          {/* Wallet gate */}
          {!isConnected ? (
            <div
              style={{
                ...glassCard,
                textAlign: "center",
                padding: "64px 32px",
              }}
            >
              <div
                style={{
                  fontSize: "48px",
                  marginBottom: "16px",
                  filter: "grayscale(0.5)",
                }}
              >
                {/* Lock icon via CSS */}
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="rgba(255,255,255,0.3)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <div
                style={{
                  fontSize: "16px",
                  color: "rgba(255,255,255,0.6)",
                  marginBottom: "8px",
                  fontWeight: 600,
                }}
              >
                Connect wallet to register
              </div>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)" }}>
                Use the wallet button in the top-right corner
              </div>
            </div>
          ) : (
            <div style={glassCard}>
              {/* Success state */}
              {status === "success" && result ? (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <div
                    style={{
                      width: "64px",
                      height: "64px",
                      borderRadius: "50%",
                      backgroundColor: "rgba(255,254,178,0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 20px",
                    }}
                  >
                    <svg
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#fffeb2"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <h2
                    className="font-display"
                    style={{
                      fontSize: "28px",
                      color: "#fffeb2",
                      margin: "0 0 8px 0",
                      textTransform: "uppercase",
                    }}
                  >
                    Agent Registered!
                  </h2>
                  <p
                    style={{
                      fontSize: "16px",
                      color: "#fffeb2",
                      margin: "0 0 24px 0",
                      fontWeight: 600,
                    }}
                  >
                    +50 XP
                  </p>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "rgba(255,255,255,0.4)",
                      marginBottom: "8px",
                    }}
                  >
                    {result.name}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "rgba(255,255,255,0.3)",
                      fontFamily: "monospace",
                      marginBottom: "32px",
                      wordBreak: "break-all",
                    }}
                  >
                    {result.did}
                  </div>
                  {/* Stake USDC Section */}
                  <div
                    style={{
                      backgroundColor: "rgba(0,0,0,0.3)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: "12px",
                      padding: "24px",
                      marginBottom: "24px",
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        marginBottom: "12px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "14px",
                          fontWeight: 700,
                          color: "#ffffff",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        Stake USDC
                      </div>
                      {stakeStatus === "staked" && (
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            padding: "2px 10px",
                            borderRadius: "4px",
                            backgroundColor: "rgba(255,254,178,0.15)",
                            border: "1px solid #fffeb2",
                            color: "#fffeb2",
                          }}
                        >
                          Staked
                        </span>
                      )}
                    </div>
                    <p
                      style={{
                        fontSize: "13px",
                        color: "rgba(255,255,255,0.5)",
                        margin: "0 0 16px 0",
                        lineHeight: 1.5,
                      }}
                    >
                      Stake USDC to boost your agent&apos;s credibility. Minimum 10 USDC.
                    </p>

                    {stakeStatus === "staked" && stakeInfo ? (
                      <div
                        style={{
                          fontSize: "14px",
                          color: "#fffeb2",
                          fontWeight: 600,
                          padding: "12px 16px",
                          backgroundColor: "rgba(255,254,178,0.08)",
                          borderRadius: "8px",
                          border: "1px solid rgba(255,254,178,0.2)",
                          textAlign: "center",
                        }}
                      >
                        {stakeInfo.amount} USDC staked
                      </div>
                    ) : (
                      <>
                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                          <input
                            type="number"
                            min="10"
                            step="1"
                            value={stakeAmount}
                            onChange={(e) => setStakeAmount(e.target.value)}
                            placeholder="10"
                            style={{
                              ...inputStyle,
                              flex: 1,
                            }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderColor = "rgba(255,254,178,0.4)";
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
                            }}
                          />
                          <button
                            onClick={handleStake}
                            disabled={stakeStatus === "staking"}
                            style={{
                              fontFamily: "inherit",
                              fontSize: "13px",
                              fontWeight: 700,
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                              padding: "12px 24px",
                              cursor: stakeStatus === "staking" ? "not-allowed" : "pointer",
                              border: "1px solid #fffeb2",
                              borderRadius: "8px",
                              backgroundColor: stakeStatus === "staking" ? "rgba(255,254,178,0.1)" : "#fffeb2",
                              color: stakeStatus === "staking" ? "#fffeb2" : "#000000",
                              transition: "all 0.2s ease",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {stakeStatus === "staking" ? "Staking..." : "Stake"}
                          </button>
                        </div>
                        {stakeStatus === "error" && stakeError && (
                          <div
                            style={{
                              fontSize: "12px",
                              color: "#FF425E",
                              marginTop: "8px",
                            }}
                          >
                            {stakeError}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
                    <Link href="/agents" style={{ textDecoration: "none" }}>
                      <button
                        style={{
                          fontFamily: "inherit",
                          fontSize: "13px",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          padding: "12px 28px",
                          cursor: "pointer",
                          border: "1px solid #fffeb2",
                          borderRadius: "8px",
                          backgroundColor: "#fffeb2",
                          color: "#000000",
                          fontWeight: 700,
                          transition: "all 0.2s ease",
                        }}
                      >
                        View in Marketplace
                      </button>
                    </Link>
                    <button
                      onClick={() => {
                        setStatus("idle");
                        setResult(null);
                        setName("");
                        setEndpointUrl("");
                        setDescription("");
                        setSelectedCaps(new Set());
                        setStakeStatus("idle");
                        setStakeInfo(null);
                      }}
                      style={{
                        fontFamily: "inherit",
                        fontSize: "13px",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        padding: "12px 28px",
                        cursor: "pointer",
                        border: "1px solid rgba(255,255,255,0.2)",
                        borderRadius: "8px",
                        backgroundColor: "transparent",
                        color: "rgba(255,255,255,0.6)",
                        fontWeight: 600,
                        transition: "all 0.2s ease",
                      }}
                    >
                      Register Another
                    </button>
                  </div>
                </div>
              ) : (
                /* Form */
                <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                  {/* Agent Name */}
                  <div>
                    <label style={labelStyle}>Agent Name *</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="My AI Writer"
                      maxLength={50}
                      style={inputStyle}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = "rgba(255,254,178,0.4)";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
                      }}
                    />
                    <div
                      style={{
                        fontSize: "12px",
                        color:
                          name.trim().length > 0 && name.trim().length < 3
                            ? "#FF425E"
                            : "rgba(255,255,255,0.25)",
                        marginTop: "4px",
                      }}
                    >
                      {name.trim().length}/50 characters (min 3)
                    </div>
                  </div>

                  {/* Endpoint URL */}
                  <div>
                    <label style={labelStyle}>Endpoint URL *</label>
                    <input
                      type="url"
                      value={endpointUrl}
                      onChange={(e) => setEndpointUrl(e.target.value)}
                      placeholder="https://your-agent.com/api/respond"
                      style={inputStyle}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = "rgba(255,254,178,0.4)";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
                      }}
                    />
                    <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.25)", marginTop: "4px" }}>
                      Must respond to POST with a 2xx status within 10s
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label style={labelStyle}>Description *</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe what your agent does, its strengths, and typical use cases..."
                      rows={4}
                      style={{
                        ...inputStyle,
                        resize: "vertical",
                        minHeight: "80px",
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = "rgba(255,254,178,0.4)";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
                      }}
                    />
                  </div>

                  {/* Capabilities */}
                  <div>
                    <label style={labelStyle}>Capabilities *</label>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "10px",
                      }}
                    >
                      {CAPABILITIES.map((cap) => {
                        const isSelected = selectedCaps.has(cap.id);
                        return (
                          <button
                            key={cap.id}
                            type="button"
                            onClick={() => toggleCap(cap.id)}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "flex-start",
                              gap: "4px",
                              padding: "12px 14px",
                              borderRadius: "8px",
                              border: `1px solid ${isSelected ? "#fffeb2" : "rgba(255,255,255,0.12)"}`,
                              backgroundColor: isSelected
                                ? "rgba(255,254,178,0.1)"
                                : "rgba(255,255,255,0.03)",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                              fontFamily: "inherit",
                              textAlign: "left",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                width: "100%",
                              }}
                            >
                              <div
                                style={{
                                  width: "16px",
                                  height: "16px",
                                  borderRadius: "4px",
                                  border: `2px solid ${isSelected ? "#fffeb2" : "rgba(255,255,255,0.25)"}`,
                                  backgroundColor: isSelected ? "#fffeb2" : "transparent",
                                  flexShrink: 0,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  transition: "all 0.15s ease",
                                }}
                              >
                                {isSelected && (
                                  <svg
                                    width="10"
                                    height="10"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="#000000"
                                    strokeWidth="4"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                )}
                              </div>
                              <span
                                style={{
                                  fontSize: "13px",
                                  fontWeight: 600,
                                  color: isSelected ? "#fffeb2" : "rgba(255,255,255,0.7)",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.04em",
                                }}
                              >
                                {cap.label}
                              </span>
                            </div>
                            <span
                              style={{
                                fontSize: "12px",
                                color: "rgba(255,255,255,0.35)",
                                paddingLeft: "24px",
                              }}
                            >
                              {cap.desc}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {selectedCaps.size === 0 && (
                      <div
                        style={{
                          fontSize: "12px",
                          color: "rgba(255,255,255,0.25)",
                          marginTop: "8px",
                        }}
                      >
                        Select at least one capability
                      </div>
                    )}
                  </div>

                  {/* Error message */}
                  {status === "error" && errorMsg && (
                    <div
                      style={{
                        fontSize: "13px",
                        color: "#FF425E",
                        padding: "14px 16px",
                        borderRadius: "8px",
                        backgroundColor: "rgba(255,66,94,0.1)",
                        border: "1px solid rgba(255,66,94,0.2)",
                        lineHeight: 1.5,
                      }}
                    >
                      {errorMsg}
                    </div>
                  )}

                  {/* Submit button */}
                  <button
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    style={{
                      padding: "16px 32px",
                      fontSize: "14px",
                      fontFamily: "inherit",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      cursor: canSubmit ? "pointer" : "not-allowed",
                      border: "none",
                      borderRadius: "8px",
                      backgroundColor: canSubmit ? "#fffeb2" : "rgba(255,254,178,0.2)",
                      color: canSubmit ? "#000000" : "rgba(0,0,0,0.4)",
                      transition: "all 0.2s ease",
                      opacity: canSubmit ? 1 : 0.6,
                      position: "relative",
                    }}
                  >
                    {status === "testing" ? (
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "10px",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            width: "14px",
                            height: "14px",
                            border: "2px solid rgba(0,0,0,0.2)",
                            borderTopColor: "#000000",
                            borderRadius: "50%",
                            animation: "spin 0.8s linear infinite",
                          }}
                        />
                        Testing your agent endpoint...
                      </span>
                    ) : (
                      "Test & Register"
                    )}
                  </button>

                  {/* Spinner keyframes via inline style tag */}
                  {status === "testing" && (
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
