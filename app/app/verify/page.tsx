"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";

export default function VerifyPage() {
  const [text, setText] = useState("");
  const [minWords, setMinWords] = useState(100);
  const [wordCount, setWordCount] = useState(0);
  const [hash, setHash] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    certificateId: string;
    verified: boolean;
    wordCount: number;
    textHash: string;
    cycleCount: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"input" | "result">("input");

  // Live word count
  useEffect(() => {
    const words = text.trim().split(/\s+/).filter((w) => w.length > 0).length;
    setWordCount(words);
  }, [text]);

  // Live SHA-256 hash computed in browser
  useEffect(() => {
    if (!text) {
      setHash("");
      return;
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    crypto.subtle.digest("SHA-256", data).then((buf) => {
      const arr = Array.from(new Uint8Array(buf));
      const hex = arr.map((b) => b.toString(16).padStart(2, "0")).join("");
      setHash(hex);
    });
  }, [text]);

  const handleVerify = useCallback(async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, minWords }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Verification failed");
      } else {
        setResult(data);
        setPhase("result");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [text, minWords]);

  const handleReset = () => {
    setText("");
    setResult(null);
    setError("");
    setPhase("input");
  };

  const certUrl = result
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/certificate/${result.certificateId}`
    : "";
  const tweetText = result
    ? encodeURIComponent(
        `My text was cryptographically verified by @covenant_sol\n\nWord count: ${result.wordCount}\nHash: ${result.textHash.slice(0, 16)}...\n\n#ZKProof #Solana\n${certUrl}`
      )
    : "";

  const glassCard: React.CSSProperties = {
    backgroundColor: "rgba(0,0,0,0.4)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "12px",
    backdropFilter: "blur(16px)",
  };

  return (
    <div style={{ minHeight: "100vh", fontFamily: "inherit", position: "relative" }}>
      {/* Background */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          backgroundImage: "url('/poster-bg.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1,
          backgroundColor: "rgba(0,0,0,0.6)",
        }}
      />

      <div style={{ position: "relative", zIndex: 2 }}>
        <NavBar activeTab="verify" variant="dark" />

        <div style={{ maxWidth: "720px", margin: "0 auto", padding: "48px 24px" }}>

          {/* ====== PHASE 1: INPUT ====== */}
          {phase === "input" && (
            <div>
              {/* Hero */}
              <div style={{ textAlign: "center", marginBottom: "36px" }}>
                <h1
                  style={{
                    fontSize: "42px",
                    fontWeight: 800,
                    color: "#ffffff",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    margin: "0 0 4px 0",
                    position: "relative",
                    display: "inline-block",
                  }}
                >
                  Verify Any Text
                  {/* Animated underline */}
                  <span
                    style={{
                      position: "absolute",
                      bottom: "-4px",
                      left: 0,
                      width: "100%",
                      height: "3px",
                      borderRadius: "2px",
                      background: "linear-gradient(90deg, #42BDFF, #FF425E, #FFE342, #42BDFF)",
                      backgroundSize: "200% 100%",
                      animation: "shimmer 3s linear infinite",
                    }}
                  />
                </h1>
                <style>{`
                  @keyframes shimmer {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                  }
                  @keyframes slideUp {
                    from { opacity: 0; transform: translateY(24px); }
                    to { opacity: 1; transform: translateY(0); }
                  }
                  @keyframes pulse-glow {
                    0%, 100% { box-shadow: 0 0 20px rgba(66,189,255,0.3), 0 0 40px rgba(255,66,94,0.15); }
                    50% { box-shadow: 0 0 30px rgba(66,189,255,0.5), 0 0 60px rgba(255,66,94,0.25); }
                  }
                `}</style>
                <p
                  style={{
                    fontSize: "14px",
                    color: "rgba(255,255,255,0.5)",
                    margin: "16px 0 0 0",
                    lineHeight: 1.6,
                    maxWidth: "520px",
                    marginLeft: "auto",
                    marginRight: "auto",
                  }}
                >
                  Cryptographic proof of content. Powered by SP1 zero-knowledge proofs on Solana.
                </p>
              </div>

              {/* Feature pills */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: "12px",
                  marginBottom: "32px",
                  flexWrap: "wrap",
                }}
              >
                {["No Wallet Needed", "Instant Verification", "Shareable Certificate"].map(
                  (label) => (
                    <span
                      key={label}
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        padding: "6px 16px",
                        borderRadius: "999px",
                        border: "1px solid rgba(255,255,255,0.15)",
                        backgroundColor: "rgba(255,255,255,0.06)",
                        color: "rgba(255,255,255,0.6)",
                        backdropFilter: "blur(8px)",
                      }}
                    >
                      {label}
                    </span>
                  )
                )}
              </div>

              {/* Textarea card */}
              <div style={{ ...glassCard, padding: "24px", marginBottom: "16px" }}>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Paste your text here..."
                  style={{
                    width: "100%",
                    height: "280px",
                    padding: "20px",
                    fontSize: "13px",
                    fontFamily: "inherit",
                    color: "#ffffff",
                    backgroundColor: "transparent",
                    border: "none",
                    outline: "none",
                    resize: "vertical",
                    lineHeight: 1.7,
                  }}
                />
              </div>

              {/* Stats bar */}
              <div
                style={{
                  ...glassCard,
                  padding: "14px 20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "16px",
                  flexWrap: "wrap",
                  marginBottom: "20px",
                }}
              >
                {/* Word count */}
                <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                  <span
                    style={{
                      fontSize: "28px",
                      fontWeight: 800,
                      color:
                        wordCount < minWords
                          ? "#FF425E"
                          : "#FFE342",
                      lineHeight: 1,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {wordCount}
                  </span>
                  <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>
                    / {minWords} words
                  </span>
                </div>

                {/* SHA-256 hash */}
                <div
                  style={{
                    flex: 1,
                    minWidth: "180px",
                    textAlign: "center",
                  }}
                >
                  {hash ? (
                    <span
                      style={{
                        fontSize: "10px",
                        fontFamily: "monospace",
                        color: "rgba(255,255,255,0.3)",
                        wordBreak: "break-all",
                      }}
                    >
                      SHA-256: {hash.slice(0, 16)}...{hash.slice(-8)}
                    </span>
                  ) : (
                    <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.2)" }}>
                      SHA-256: waiting for input...
                    </span>
                  )}
                </div>

                {/* Min words input */}
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <label
                    style={{
                      fontSize: "10px",
                      color: "rgba(255,255,255,0.4)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Min:
                  </label>
                  <input
                    type="number"
                    value={minWords}
                    onChange={(e) =>
                      setMinWords(Math.max(1, parseInt(e.target.value) || 1))
                    }
                    style={{
                      width: "64px",
                      padding: "4px 8px",
                      fontSize: "12px",
                      fontFamily: "inherit",
                      color: "#ffffff",
                      backgroundColor: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: "6px",
                      outline: "none",
                      textAlign: "center",
                    }}
                  />
                </div>
              </div>

              {/* Verify button */}
              <button
                onClick={handleVerify}
                disabled={loading || !text.trim()}
                style={{
                  width: "100%",
                  height: "48px",
                  fontSize: "15px",
                  fontFamily: "inherit",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  cursor: loading || !text.trim() ? "not-allowed" : "pointer",
                  border: "none",
                  borderRadius: "10px",
                  background:
                    loading || !text.trim()
                      ? "rgba(255,255,255,0.1)"
                      : "linear-gradient(135deg, #42BDFF 0%, #FF425E 100%)",
                  color: loading || !text.trim() ? "rgba(255,255,255,0.3)" : "#ffffff",
                  transition: "all 0.25s ease",
                  boxShadow:
                    !loading && text.trim()
                      ? "0 4px 24px rgba(66,189,255,0.3), 0 4px 24px rgba(255,66,94,0.2)"
                      : "none",
                }}
                onMouseEnter={(e) => {
                  if (!loading && text.trim()) {
                    e.currentTarget.style.animation = "pulse-glow 1.5s ease infinite";
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.animation = "none";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                {loading ? "Verifying..." : "VERIFY NOW"}
              </button>

              <p
                style={{
                  textAlign: "center",
                  fontSize: "11px",
                  color: "rgba(255,255,255,0.3)",
                  marginTop: "12px",
                  letterSpacing: "0.02em",
                }}
              >
                Free. No account needed. Results in milliseconds.
              </p>

              {/* Error */}
              {error && (
                <div
                  style={{
                    marginTop: "16px",
                    padding: "12px 16px",
                    fontSize: "12px",
                    color: "#FF425E",
                    backgroundColor: "rgba(255,66,94,0.1)",
                    border: "1px solid rgba(255,66,94,0.25)",
                    borderRadius: "8px",
                  }}
                >
                  {error}
                </div>
              )}
            </div>
          )}

          {/* ====== PHASE 2: RESULT ====== */}
          {phase === "result" && result && (
            <div style={{ animation: "slideUp 0.4s ease" }}>
              {/* Status icon */}
              <div style={{ textAlign: "center", marginBottom: "24px" }}>
                <div
                  style={{
                    width: "80px",
                    height: "80px",
                    borderRadius: "50%",
                    margin: "0 auto 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "40px",
                    fontWeight: 700,
                    backgroundColor: result.verified
                      ? "rgba(255,227,66,0.12)"
                      : "rgba(255,66,94,0.12)",
                    border: result.verified
                      ? "2px solid rgba(255,227,66,0.3)"
                      : "2px solid rgba(255,66,94,0.3)",
                    color: result.verified ? "#FFE342" : "#FF425E",
                  }}
                >
                  {result.verified ? "\u2713" : "\u2717"}
                </div>
                <h2
                  style={{
                    fontSize: "32px",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: result.verified ? "#FFE342" : "#FF425E",
                    margin: "0 0 4px 0",
                  }}
                >
                  {result.verified ? "VERIFIED" : "FAILED"}
                </h2>
                <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", margin: 0 }}>
                  Certificate #{result.certificateId.slice(0, 8).toUpperCase()}
                </p>
              </div>

              {/* Stats grid (2x2) */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                  marginBottom: "24px",
                }}
              >
                {[
                  {
                    label: "Word Count",
                    value: `${result.wordCount} / ${minWords} required`,
                  },
                  {
                    label: "Text Hash",
                    value: `0x${result.textHash.slice(0, 12)}...`,
                    mono: true,
                  },
                  { label: "Circuit", value: "SP1 Word Count" },
                  {
                    label: "Cycles",
                    value: result.cycleCount.toLocaleString(),
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      ...glassCard,
                      padding: "16px 20px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "9px",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        color: "rgba(255,255,255,0.4)",
                        marginBottom: "6px",
                      }}
                    >
                      {item.label}
                    </div>
                    <div
                      style={{
                        fontSize: "15px",
                        fontWeight: 600,
                        color: "#ffffff",
                        fontFamily: item.mono ? "monospace" : "inherit",
                      }}
                    >
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Certificate preview mini card */}
              <div
                style={{
                  ...glassCard,
                  padding: "20px 24px",
                  marginBottom: "24px",
                  textAlign: "center",
                  border: result.verified
                    ? "1px solid rgba(255,227,66,0.2)"
                    : "1px solid rgba(255,66,94,0.2)",
                }}
              >
                <div
                  style={{
                    fontSize: "9px",
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    color: "rgba(255,255,255,0.35)",
                    marginBottom: "8px",
                  }}
                >
                  Certificate of Verification
                </div>
                <div
                  style={{
                    fontSize: "18px",
                    fontWeight: 700,
                    color: "#ffffff",
                    marginBottom: "4px",
                  }}
                >
                  {result.wordCount} Words Verified
                </div>
                <div
                  style={{
                    fontSize: "10px",
                    fontFamily: "monospace",
                    color: "rgba(255,255,255,0.3)",
                    wordBreak: "break-all",
                  }}
                >
                  {result.textHash}
                </div>
                <div
                  style={{
                    marginTop: "12px",
                    fontSize: "10px",
                    color: "rgba(255,255,255,0.25)",
                  }}
                >
                  Powered by SP1 ZK Proofs on Solana
                </div>
              </div>

              {/* Action buttons */}
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  justifyContent: "center",
                  flexWrap: "wrap",
                }}
              >
                {/* Primary: View Certificate */}
                <Link
                  href={`/certificate/${result.certificateId}`}
                  style={{
                    flex: 1,
                    minWidth: "160px",
                    textAlign: "center",
                    padding: "14px 24px",
                    fontSize: "12px",
                    fontFamily: "inherit",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    textDecoration: "none",
                    border: "none",
                    borderRadius: "10px",
                    background: "linear-gradient(135deg, #42BDFF 0%, #FF425E 100%)",
                    color: "#ffffff",
                    transition: "all 0.2s ease",
                    boxShadow: "0 4px 20px rgba(66,189,255,0.25)",
                  }}
                >
                  View Certificate
                </Link>

                {/* Secondary: Share on X */}
                <a
                  href={`https://twitter.com/intent/tweet?text=${tweetText}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    flex: 1,
                    minWidth: "140px",
                    textAlign: "center",
                    padding: "14px 24px",
                    fontSize: "12px",
                    fontFamily: "inherit",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    textDecoration: "none",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: "10px",
                    backgroundColor: "rgba(255,255,255,0.06)",
                    color: "#ffffff",
                    transition: "all 0.2s ease",
                    backdropFilter: "blur(8px)",
                  }}
                >
                  Share on X
                </a>

                {/* Ghost: Verify Another */}
                <button
                  onClick={handleReset}
                  style={{
                    flex: 1,
                    minWidth: "140px",
                    padding: "14px 24px",
                    fontSize: "12px",
                    fontFamily: "inherit",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "10px",
                    backgroundColor: "transparent",
                    color: "rgba(255,255,255,0.5)",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)";
                    e.currentTarget.style.color = "rgba(255,255,255,0.8)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                    e.currentTarget.style.color = "rgba(255,255,255,0.5)";
                  }}
                >
                  Verify Another
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
