"use client";

import { useState } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";

interface ProofResult {
  passed: boolean;
  wordCount: number;
  textHash: string;
  cycleCount: number;
  executionTime: string;
}

export default function TryItPage() {
  const [text, setText] = useState("");
  const [minWords, setMinWords] = useState(100);
  const [proving, setProving] = useState(false);
  const [result, setResult] = useState<ProofResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const progress = minWords > 0 ? Math.min((wordCount / minWords) * 100, 100) : 0;

  async function handleProve() {
    if (!text.trim()) return;
    setProving(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/proof/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, minWords }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Proof execution failed");
        return;
      }
      const data = await res.json();
      setResult(data);
    } catch {
      setError("Network error");
    } finally {
      setProving(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", fontFamily: "inherit", position: "relative" }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0, backgroundColor: "#0a0a14" }} />
      <div style={{ position: "relative", zIndex: 2 }}>
        <NavBar activeTab="home" variant="dark" />

        <div style={{ maxWidth: "600px", margin: "0 auto", padding: "64px 24px" }}>
          <div style={{ textAlign: "center", marginBottom: "40px" }}>
            <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#ffffff", margin: "0 0 8px 0", textTransform: "uppercase" }}>
              Try It Now
            </h1>
            <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.45)", margin: 0 }}>
              No wallet needed. See how zero-knowledge proofs verify work delivery.
            </p>
          </div>

          {/* Text area */}
          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.4)", marginBottom: "8px" }}>
              Type or paste your text
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write or paste any text here. The ZK proof will verify the word count without revealing the content..."
              rows={8}
              style={{
                width: "100%",
                padding: "14px",
                fontSize: "13px",
                fontFamily: "inherit",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.15)",
                backgroundColor: "rgba(255,255,255,0.05)",
                color: "#ffffff",
                outline: "none",
                resize: "vertical",
                lineHeight: 1.6,
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; }}
            />
          </div>

          {/* Word count + min words input */}
          <div style={{ display: "flex", gap: "16px", marginBottom: "20px", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.4)", marginBottom: "8px" }}>
                Min Words
              </label>
              <input
                type="number"
                value={minWords}
                onChange={(e) => setMinWords(parseInt(e.target.value) || 0)}
                min={1}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  fontSize: "13px",
                  fontFamily: "inherit",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.15)",
                  backgroundColor: "rgba(255,255,255,0.05)",
                  color: "#ffffff",
                  outline: "none",
                }}
              />
            </div>
            <div style={{ flex: 1, textAlign: "right" }}>
              <div style={{ fontSize: "24px", fontWeight: 700, color: wordCount >= minWords ? "#86efac" : "#ffffff" }}>
                {wordCount}
              </div>
              <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>
                words typed
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ marginBottom: "24px" }}>
            <div style={{
              width: "100%",
              height: "4px",
              borderRadius: "2px",
              backgroundColor: "rgba(255,255,255,0.1)",
              overflow: "hidden",
            }}>
              <div style={{
                width: `${progress}%`,
                height: "100%",
                borderRadius: "2px",
                backgroundColor: progress >= 100 ? "#86efac" : "#3B82F6",
                transition: "width 0.3s ease, background-color 0.3s ease",
              }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
              <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.3)" }}>0</span>
              <span style={{ fontSize: "9px", color: progress >= 100 ? "#86efac" : "rgba(255,255,255,0.3)" }}>
                {Math.round(progress)}%
              </span>
              <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.3)" }}>{minWords}</span>
            </div>
          </div>

          {/* Prove button */}
          <button
            onClick={handleProve}
            disabled={proving || !text.trim()}
            style={{
              width: "100%",
              fontFamily: "inherit",
              fontSize: "14px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              padding: "14px",
              cursor: proving ? "wait" : "pointer",
              border: "1px solid #ffffff",
              borderRadius: "8px",
              backgroundColor: proving ? "rgba(255,255,255,0.05)" : "#ffffff",
              color: proving ? "rgba(255,255,255,0.5)" : "#000000",
              fontWeight: 600,
              transition: "all 0.2s ease",
              marginBottom: "24px",
              opacity: !text.trim() ? 0.4 : 1,
            }}
          >
            {proving ? "Proving..." : "Prove It"}
          </button>

          {/* Error */}
          {error && (
            <div style={{
              padding: "12px 16px",
              borderRadius: "8px",
              border: "1px solid rgba(252,165,165,0.3)",
              backgroundColor: "rgba(252,165,165,0.1)",
              fontSize: "12px",
              color: "#fca5a5",
              marginBottom: "24px",
            }}>
              {error}
            </div>
          )}

          {/* Result */}
          {result && (
            <div
              style={{
                border: `1px solid ${result.passed ? "rgba(134,239,172,0.3)" : "rgba(252,165,165,0.3)"}`,
                borderRadius: "12px",
                padding: "24px",
                backgroundColor: result.passed ? "rgba(134,239,172,0.05)" : "rgba(252,165,165,0.05)",
                marginBottom: "32px",
              }}
            >
              <div style={{ textAlign: "center", marginBottom: "20px" }}>
                <div style={{
                  fontSize: "32px",
                  fontWeight: 700,
                  color: result.passed ? "#86efac" : "#fca5a5",
                }}>
                  {result.passed ? "VERIFIED" : "FAILED"}
                </div>
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", marginTop: "4px" }}>
                  Word count: {result.wordCount} / {minWords} required
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>SHA-256 Hash</span>
                  <span style={{ color: "rgba(255,255,255,0.7)", fontFamily: "monospace", fontSize: "10px" }}>
                    {result.textHash.slice(0, 24)}...
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>Cycle Count</span>
                  <span style={{ color: "rgba(255,255,255,0.7)" }}>
                    {result.cycleCount.toLocaleString()}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>Execution Time</span>
                  <span style={{ color: "rgba(255,255,255,0.7)" }}>{result.executionTime}</span>
                </div>
              </div>
            </div>
          )}

          {/* Explanation */}
          <div style={{
            textAlign: "center",
            padding: "20px",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "10px",
            backgroundColor: "rgba(255,255,255,0.02)",
            marginBottom: "24px",
          }}>
            <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", lineHeight: 1.7, margin: 0 }}>
              This is exactly what happens on-chain with every job.
              <br />
              The SP1 zkVM circuit verifies word count and binds the text to its SHA-256 hash
              <br />
              without revealing the content. Payment is released only when proof passes.
            </p>
          </div>

          {/* CTA */}
          <div style={{ textAlign: "center" }}>
            <Link
              href="/poster"
              style={{
                fontSize: "13px",
                color: "#3B82F6",
                textDecoration: "none",
                transition: "color 0.15s ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#60a5fa"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "#3B82F6"; }}
            >
              Ready to start? Connect wallet &rarr;
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
