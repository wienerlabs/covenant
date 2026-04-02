"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";

interface ProofResult {
  passed: boolean;
  wordCount: number;
  textHash: string;
  cycleCount: number;
  executionTime: string;
}

async function computeHash(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function TryItPage() {
  const [text, setText] = useState("");
  const [minWords, setMinWords] = useState(100);
  const [proving, setProving] = useState(false);
  const [result, setResult] = useState<ProofResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveHash, setLiveHash] = useState<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const charCount = text.length;
  const progress = minWords > 0 ? Math.min((wordCount / minWords) * 100, 100) : 0;
  const wordCountPasses = wordCount >= minWords;

  // Live SHA-256 hash computation with debounce
  const updateHash = useCallback(async (value: string) => {
    if (!value.trim()) {
      setLiveHash("");
      return;
    }
    try {
      const hash = await computeHash(value);
      setLiveHash(hash);
    } catch {
      setLiveHash("error");
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateHash(text);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [text, updateHash]);

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

  const boxStyle = (active: boolean, pass: boolean): React.CSSProperties => ({
    border: `1px solid ${active ? (pass ? "rgba(134,239,172,0.4)" : "rgba(252,165,165,0.4)") : "rgba(255,255,255,0.12)"}`,
    borderRadius: "8px",
    padding: "8px 12px",
    backgroundColor: active
      ? pass
        ? "rgba(134,239,172,0.08)"
        : "rgba(252,165,165,0.08)"
      : "rgba(255,255,255,0.04)",
    backdropFilter: "blur(8px)",
    fontSize: "10px",
    color: active ? (pass ? "#86efac" : "#fca5a5") : "rgba(255,255,255,0.5)",
    fontFamily: "monospace",
    textAlign: "center",
    transition: "all 0.3s ease",
  });

  const arrowStyle: React.CSSProperties = {
    fontSize: "12px",
    color: "rgba(255,255,255,0.25)",
    margin: "0 6px",
    flexShrink: 0,
  };

  return (
    <div style={{ minHeight: "100vh", fontFamily: "inherit", position: "relative" }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0, backgroundColor: "#0a0a14" }} />
      <div style={{ position: "relative", zIndex: 2 }}>
        <NavBar activeTab="home" variant="dark" />

        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "40px 24px" }}>
          <div style={{ textAlign: "center", marginBottom: "32px" }}>
            <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#ffffff", margin: "0 0 8px 0", textTransform: "uppercase" }}>
              Proof Playground
            </h1>
            <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.45)", margin: 0 }}>
              Interactive zero-knowledge proof circuit. Type text and watch the proof execute in real-time.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
            {/* LEFT SIDE: Text Input */}
            <div>
              <div style={{
                backgroundColor: "rgba(255,255,255,0.05)",
                backdropFilter: "blur(16px)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "12px",
                padding: "20px",
              }}>
                <label style={{ display: "block", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.4)", marginBottom: "8px" }}>
                  Input Text
                </label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Write or paste any text here. The ZK proof will verify the word count without revealing the content..."
                  rows={10}
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
                    boxSizing: "border-box",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; }}
                />

                {/* Live stats */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginTop: "16px" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "28px", fontWeight: 700, color: wordCountPasses ? "#86efac" : "#ffffff" }}>
                      {wordCount}
                    </div>
                    <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>Words</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "28px", fontWeight: 700, color: "#ffffff" }}>
                      {charCount}
                    </div>
                    <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>Characters</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "10px", fontFamily: "monospace", color: "rgba(255,255,255,0.6)", wordBreak: "break-all", maxHeight: "40px", overflow: "hidden" }}>
                      {liveHash ? `0x${liveHash.slice(0, 16)}...` : "---"}
                    </div>
                    <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginTop: "4px" }}>SHA-256</div>
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ marginTop: "12px" }}>
                  <div style={{
                    width: "100%",
                    height: "6px",
                    borderRadius: "3px",
                    backgroundColor: "rgba(255,255,255,0.1)",
                    overflow: "hidden",
                  }}>
                    <div style={{
                      width: `${progress}%`,
                      height: "100%",
                      borderRadius: "3px",
                      backgroundColor: progress >= 100 ? "#86efac" : "#3B82F6",
                      transition: "width 0.3s ease, background-color 0.3s ease",
                    }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
                    <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.3)" }}>0</span>
                    <span style={{ fontSize: "9px", color: progress >= 100 ? "#86efac" : "rgba(255,255,255,0.3)" }}>
                      {Math.round(progress)}%
                    </span>
                    <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.3)" }}>{minWords}</span>
                  </div>
                </div>

                {/* Min words */}
                <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "12px" }}>
                  <label style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}>
                    Min Words:
                  </label>
                  <input
                    type="number"
                    value={minWords}
                    onChange={(e) => setMinWords(parseInt(e.target.value) || 0)}
                    min={1}
                    style={{
                      width: "80px",
                      padding: "6px 10px",
                      fontSize: "13px",
                      fontFamily: "inherit",
                      borderRadius: "6px",
                      border: "1px solid rgba(255,255,255,0.15)",
                      backgroundColor: "rgba(255,255,255,0.05)",
                      color: "#ffffff",
                      outline: "none",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* RIGHT SIDE: Proof Visualization */}
            <div>
              <div style={{
                backgroundColor: "rgba(255,255,255,0.05)",
                backdropFilter: "blur(16px)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "12px",
                padding: "20px",
              }}>
                <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.4)", marginBottom: "16px" }}>
                  Circuit Diagram
                </div>

                {/* Row 1: INPUT text -> SHA-256 -> hash */}
                <div style={{ display: "flex", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "4px" }}>
                  <div style={boxStyle(text.length > 0, true)}>
                    INPUT: text
                  </div>
                  <span style={arrowStyle}>&rarr;</span>
                  <div style={boxStyle(text.length > 0, true)}>
                    SHA-256
                  </div>
                  <span style={arrowStyle}>&rarr;</span>
                  <div style={{ ...boxStyle(liveHash.length > 0, true), flex: 1, minWidth: "120px" }}>
                    hash: {liveHash ? `0x${liveHash.slice(0, 10)}...` : "---"}
                  </div>
                </div>

                {/* Arrow down */}
                <div style={{ textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: "14px", margin: "4px 0" }}>
                  &#8595; compare
                </div>

                {/* Row 2: INPUT min_words -> COUNT -> result */}
                <div style={{ display: "flex", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "4px" }}>
                  <div style={boxStyle(minWords > 0, true)}>
                    INPUT: min_words={minWords}
                  </div>
                  <span style={arrowStyle}>&rarr;</span>
                  <div style={boxStyle(text.length > 0, wordCountPasses)}>
                    COUNT
                  </div>
                  <span style={arrowStyle}>&rarr;</span>
                  <div style={boxStyle(text.length > 0, wordCountPasses)}>
                    result: {wordCount} {wordCountPasses ? ">=" : "<"} {minWords}
                  </div>
                </div>

                {/* Arrow down */}
                <div style={{ textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: "14px", margin: "4px 0" }}>
                  &#8595;
                </div>

                {/* VERDICT */}
                <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }}>
                  <div
                    style={{
                      border: `2px solid ${text.length > 0 ? (wordCountPasses ? "rgba(134,239,172,0.5)" : "rgba(252,165,165,0.5)") : "rgba(255,255,255,0.12)"}`,
                      borderRadius: "10px",
                      padding: "12px 24px",
                      backgroundColor: text.length > 0
                        ? wordCountPasses
                          ? "rgba(134,239,172,0.1)"
                          : "rgba(252,165,165,0.1)"
                        : "rgba(255,255,255,0.04)",
                      fontSize: "14px",
                      fontWeight: 700,
                      color: text.length > 0
                        ? wordCountPasses
                          ? "#86efac"
                          : "#fca5a5"
                        : "rgba(255,255,255,0.3)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      transition: "all 0.3s ease",
                    }}
                  >
                    VERDICT: {text.length > 0 ? (wordCountPasses ? "PASS" : "FAIL") : "---"}
                  </div>
                </div>

                {/* Execute button */}
                <button
                  onClick={handleProve}
                  disabled={proving || !text.trim()}
                  style={{
                    width: "100%",
                    fontFamily: "inherit",
                    fontSize: "13px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    padding: "12px",
                    cursor: proving ? "wait" : "pointer",
                    border: "1px solid #ffffff",
                    borderRadius: "8px",
                    backgroundColor: proving ? "rgba(255,255,255,0.05)" : "#ffffff",
                    color: proving ? "rgba(255,255,255,0.5)" : "#000000",
                    fontWeight: 600,
                    transition: "all 0.2s ease",
                    opacity: !text.trim() ? 0.4 : 1,
                  }}
                >
                  {proving ? "Executing Circuit..." : "Execute Circuit"}
                </button>

                {/* Error */}
                {error && (
                  <div style={{
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: "1px solid rgba(252,165,165,0.3)",
                    backgroundColor: "rgba(252,165,165,0.1)",
                    fontSize: "11px",
                    color: "#fca5a5",
                    marginTop: "12px",
                  }}>
                    {error}
                  </div>
                )}

                {/* Result Panel */}
                {result && (
                  <div
                    style={{
                      border: `1px solid ${result.passed ? "rgba(134,239,172,0.3)" : "rgba(252,165,165,0.3)"}`,
                      borderRadius: "10px",
                      padding: "16px",
                      backgroundColor: result.passed ? "rgba(134,239,172,0.05)" : "rgba(252,165,165,0.05)",
                      marginTop: "16px",
                    }}
                  >
                    <div style={{ textAlign: "center", marginBottom: "12px" }}>
                      <div style={{
                        fontSize: "24px",
                        fontWeight: 700,
                        color: result.passed ? "#86efac" : "#fca5a5",
                      }}>
                        {result.passed ? "VERIFIED" : "FAILED"}
                      </div>
                      <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", marginTop: "2px" }}>
                        Word count: {result.wordCount} / {minWords} required
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px" }}>
                        <span style={{ color: "rgba(255,255,255,0.5)" }}>Cycle Count</span>
                        <span style={{ color: "rgba(255,255,255,0.7)" }}>{result.cycleCount.toLocaleString()}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px" }}>
                        <span style={{ color: "rgba(255,255,255,0.5)" }}>Execution Time</span>
                        <span style={{ color: "rgba(255,255,255,0.7)" }}>{result.executionTime}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px" }}>
                        <span style={{ color: "rgba(255,255,255,0.5)" }}>Verified</span>
                        <span style={{ color: result.passed ? "#86efac" : "#fca5a5" }}>{result.passed ? "Yes" : "No"}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Explanation */}
          <div style={{
            textAlign: "center",
            padding: "20px",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "10px",
            backgroundColor: "rgba(255,255,255,0.02)",
            marginTop: "24px",
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
          <div style={{ textAlign: "center", paddingBottom: "40px" }}>
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
