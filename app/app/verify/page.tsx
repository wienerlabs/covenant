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
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [text, minWords]);

  const progress = minWords > 0 ? Math.min((wordCount / minWords) * 100, 100) : 0;
  const certUrl = result
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/certificate/${result.certificateId}`
    : "";
  const tweetText = result
    ? encodeURIComponent(
        `My text was cryptographically verified by @covenant_sol\n\nWord count: ${result.wordCount}\nHash: ${result.textHash.slice(0, 16)}...\n\n#ZKProof #Solana\n${certUrl}`
      )
    : "";

  return (
    <div style={{ minHeight: "100vh", fontFamily: "inherit", position: "relative" }}>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)",
        }}
      />
      <div style={{ position: "relative", zIndex: 2 }}>
        <NavBar activeTab="home" variant="dark" />

        <div style={{ maxWidth: "700px", margin: "0 auto", padding: "48px 24px" }}>
          <div style={{ textAlign: "center", marginBottom: "40px" }}>
            <h1
              style={{
                fontSize: "32px",
                fontWeight: 700,
                color: "#ffffff",
                textTransform: "uppercase",
                margin: "0 0 12px 0",
              }}
            >
              Verify Any Text
            </h1>
            <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.5)", margin: 0, lineHeight: 1.6 }}>
              Paste your text. Get cryptographic proof of word count. Share the certificate.
            </p>
          </div>

          {/* Textarea */}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your text here..."
            style={{
              width: "100%",
              height: "300px",
              padding: "20px",
              fontSize: "13px",
              fontFamily: "inherit",
              color: "#ffffff",
              backgroundColor: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "12px",
              outline: "none",
              resize: "vertical",
              lineHeight: 1.7,
              backdropFilter: "blur(12px)",
            }}
          />

          {/* Controls row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: "16px",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <label style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Min Words:
              </label>
              <input
                type="number"
                value={minWords}
                onChange={(e) => setMinWords(Math.max(1, parseInt(e.target.value) || 1))}
                style={{
                  width: "80px",
                  padding: "6px 10px",
                  fontSize: "13px",
                  fontFamily: "inherit",
                  color: "#ffffff",
                  backgroundColor: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: "6px",
                  outline: "none",
                }}
              />
            </div>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>
              <span style={{ color: wordCount >= minWords ? "#86efac" : "#fca5a5", fontWeight: 600 }}>
                {wordCount}
              </span>
              {" / "}
              {minWords} words
            </div>
          </div>

          {/* Progress bar */}
          <div
            style={{
              marginTop: "12px",
              height: "4px",
              borderRadius: "2px",
              backgroundColor: "rgba(255,255,255,0.1)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progress}%`,
                backgroundColor: progress >= 100 ? "#86efac" : "#3B82F6",
                borderRadius: "2px",
                transition: "width 0.3s ease, background-color 0.3s ease",
              }}
            />
          </div>

          {/* Hash preview */}
          {hash && (
            <div
              style={{
                marginTop: "12px",
                fontSize: "10px",
                color: "rgba(255,255,255,0.35)",
                fontFamily: "monospace",
                wordBreak: "break-all",
              }}
            >
              SHA-256: {hash}
            </div>
          )}

          {/* Verify button */}
          <button
            onClick={handleVerify}
            disabled={loading || !text.trim()}
            style={{
              marginTop: "24px",
              width: "100%",
              padding: "14px 24px",
              fontSize: "14px",
              fontFamily: "inherit",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              cursor: loading || !text.trim() ? "not-allowed" : "pointer",
              border: "1px solid #3B82F6",
              borderRadius: "8px",
              backgroundColor: loading ? "rgba(59,130,246,0.2)" : "#3B82F6",
              color: loading ? "#3B82F6" : "#ffffff",
              transition: "all 0.2s ease",
              opacity: !text.trim() ? 0.4 : 1,
            }}
          >
            {loading ? "Verifying..." : "Verify & Get Certificate"}
          </button>

          {error && (
            <div
              style={{
                marginTop: "16px",
                padding: "12px 16px",
                fontSize: "12px",
                color: "#fca5a5",
                backgroundColor: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.2)",
                borderRadius: "8px",
              }}
            >
              {error}
            </div>
          )}

          {/* Certificate Preview */}
          {result && (
            <div
              style={{
                marginTop: "32px",
                padding: "32px",
                borderRadius: "16px",
                backgroundColor: "rgba(255,255,255,0.05)",
                border: `1px solid ${result.verified ? "rgba(134,239,172,0.3)" : "rgba(252,165,165,0.3)"}`,
                backdropFilter: "blur(16px)",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "48px",
                  marginBottom: "12px",
                }}
              >
                {result.verified ? "\u2713" : "\u2717"}
              </div>
              <div
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  color: result.verified ? "#86efac" : "#fca5a5",
                  textTransform: "uppercase",
                  marginBottom: "8px",
                }}
              >
                {result.verified ? "Verified" : "Not Verified"}
              </div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginBottom: "20px" }}>
                Certificate #{result.certificateId.slice(0, 8).toUpperCase()}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                  textAlign: "left",
                  marginBottom: "24px",
                }}
              >
                <div
                  style={{
                    padding: "12px",
                    borderRadius: "8px",
                    backgroundColor: "rgba(255,255,255,0.05)",
                  }}
                >
                  <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Word Count
                  </div>
                  <div style={{ fontSize: "16px", color: "#ffffff", fontWeight: 600 }}>
                    {result.wordCount} / {minWords}
                  </div>
                </div>
                <div
                  style={{
                    padding: "12px",
                    borderRadius: "8px",
                    backgroundColor: "rgba(255,255,255,0.05)",
                  }}
                >
                  <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Cycle Count
                  </div>
                  <div style={{ fontSize: "16px", color: "#ffffff", fontWeight: 600 }}>
                    {result.cycleCount.toLocaleString()}
                  </div>
                </div>
              </div>

              <div
                style={{
                  fontSize: "10px",
                  color: "rgba(255,255,255,0.3)",
                  fontFamily: "monospace",
                  wordBreak: "break-all",
                  marginBottom: "24px",
                }}
              >
                Hash: {result.textHash}
              </div>

              {/* Share buttons */}
              <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
                <Link
                  href={`/certificate/${result.certificateId}`}
                  style={{
                    padding: "10px 20px",
                    fontSize: "11px",
                    fontFamily: "inherit",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    textDecoration: "none",
                    border: "1px solid rgba(255,255,255,0.3)",
                    borderRadius: "6px",
                    color: "#ffffff",
                    backgroundColor: "rgba(255,255,255,0.05)",
                    transition: "all 0.15s ease",
                  }}
                >
                  View Certificate
                </Link>
                <button
                  onClick={() => navigator.clipboard.writeText(certUrl)}
                  style={{
                    padding: "10px 20px",
                    fontSize: "11px",
                    fontFamily: "inherit",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    cursor: "pointer",
                    border: "1px solid rgba(255,255,255,0.3)",
                    borderRadius: "6px",
                    color: "#ffffff",
                    backgroundColor: "rgba(255,255,255,0.05)",
                    transition: "all 0.15s ease",
                  }}
                >
                  Copy Link
                </button>
                <a
                  href={`https://twitter.com/intent/tweet?text=${tweetText}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: "10px 20px",
                    fontSize: "11px",
                    fontFamily: "inherit",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    textDecoration: "none",
                    border: "1px solid #1d9bf0",
                    borderRadius: "6px",
                    color: "#1d9bf0",
                    backgroundColor: "rgba(29,155,240,0.1)",
                    transition: "all 0.15s ease",
                  }}
                >
                  Share on X
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
