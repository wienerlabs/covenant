"use client";

import { useState, useEffect, useCallback } from "react";
import NavBar from "@/components/NavBar";

const CIRCUIT_TESTS = [
  {
    id: 1,
    words: 600,
    minWords: 500,
    pass: true,
    cycles: 237583,
    detail: "Word count 600 >= 500",
  },
  {
    id: 2,
    words: 100,
    minWords: 500,
    pass: false,
    cycles: null,
    detail: "Assertion failed: word count below minimum",
  },
];

export default function ProofPage() {
  const [text, setText] = useState("");
  const [minWords, setMinWords] = useState(100);
  const [wordCount, setWordCount] = useState(0);
  const [hash, setHash] = useState("");
  const [executing, setExecuting] = useState(false);
  const [circuitResult, setCircuitResult] = useState<{
    passed: boolean;
    wordCount: number;
    textHash: string;
    cycleCount: number;
    executionTime: string;
  } | null>(null);

  const computeHash = useCallback(async (input: string) => {
    if (!input.trim()) {
      setHash("");
      return;
    }
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(input);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
      setHash(hashHex);
    } catch {
      setHash("error computing hash");
    }
  }, []);

  useEffect(() => {
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    setWordCount(words);
    computeHash(text);
  }, [text, computeHash]);

  const wouldPass = wordCount >= minWords && text.trim().length > 0;
  const progress = minWords > 0 ? Math.min((wordCount / minWords) * 100, 100) : 0;

  async function executeCircuit() {
    if (!text.trim()) return;
    setExecuting(true);
    setCircuitResult(null);
    try {
      const res = await fetch("/api/proof/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, minWords }),
      });
      if (res.ok) {
        const data = await res.json();
        setCircuitResult(data);
      }
    } catch {
      // silently fail
    } finally {
      setExecuting(false);
    }
  }

  const glassCard: React.CSSProperties = {
    backgroundColor: "rgba(255,255,255,0.07)",
    backdropFilter: "blur(16px)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "10px",
    padding: "24px",
  };

  const flowStep: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "10px 14px",
    borderRadius: "6px",
    backgroundColor: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    fontSize: "12px",
    color: "#ffffff",
  };

  const arrowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "center",
    padding: "4px 0",
    color: "rgba(255,255,255,0.3)",
    fontSize: "14px",
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
          backgroundRepeat: "no-repeat",
        }}
      />
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
        }}
      />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 2 }}>
        <NavBar activeTab="proof" variant="dark" />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "24px",
            maxWidth: "1100px",
            margin: "0 auto",
            padding: "32px 24px",
          }}
        >
          {/* Left column - Circuit Specification */}
          <div>
            <h2
              style={{
                fontSize: "14px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "#ffffff",
                margin: "0 0 16px 0",
              }}
            >
              Circuit Specification
            </h2>

            <div style={glassCard}>
              <div
                style={{
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "rgba(255,255,255,0.4)",
                  marginBottom: "16px",
                }}
              >
                SP1 zkVM Word-Count Verifier
              </div>

              {/* Flow: Input text */}
              <div style={flowStep}>
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", textTransform: "uppercase", minWidth: "50px" }}>
                  Input
                </span>
                <span>text (private witness)</span>
              </div>
              <div style={arrowStyle}>|</div>

              {/* SHA-256 hash */}
              <div style={flowStep}>
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", textTransform: "uppercase", minWidth: "50px" }}>
                  Step 1
                </span>
                <span>SHA-256(text) = text_hash</span>
              </div>
              <div style={arrowStyle}>|</div>

              {/* Compare hash */}
              <div style={flowStep}>
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", textTransform: "uppercase", minWidth: "50px" }}>
                  Step 2
                </span>
                <span>COMPARE text_hash == committed_hash</span>
              </div>
              <div style={arrowStyle}>|</div>

              {/* Input min_words */}
              <div style={flowStep}>
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", textTransform: "uppercase", minWidth: "50px" }}>
                  Input
                </span>
                <span>min_words (public parameter)</span>
              </div>
              <div style={arrowStyle}>|</div>

              {/* Count words */}
              <div style={flowStep}>
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", textTransform: "uppercase", minWidth: "50px" }}>
                  Step 3
                </span>
                <span>COUNT words in text</span>
              </div>
              <div style={arrowStyle}>|</div>

              {/* Assert */}
              <div style={flowStep}>
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", textTransform: "uppercase", minWidth: "50px" }}>
                  Step 4
                </span>
                <span>ASSERT word_count &gt;= min_words</span>
              </div>
              <div style={arrowStyle}>|</div>

              {/* Output */}
              <div
                style={{
                  ...flowStep,
                  borderColor: "rgba(255,255,255,0.25)",
                  backgroundColor: "rgba(255,255,255,0.08)",
                }}
              >
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", textTransform: "uppercase", minWidth: "50px" }}>
                  Output
                </span>
                <span>(min_words, text_hash) as public values</span>
              </div>
            </div>
          </div>

          {/* Right column - Live Verifier */}
          <div>
            <h2
              style={{
                fontSize: "14px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "#ffffff",
                margin: "0 0 16px 0",
              }}
            >
              Live Verifier
            </h2>

            <div style={glassCard}>
              {/* Textarea */}
              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "rgba(255,255,255,0.4)",
                    marginBottom: "6px",
                  }}
                >
                  Paste text
                </label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Enter text to verify word count..."
                  style={{
                    width: "100%",
                    minHeight: "120px",
                    backgroundColor: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: "6px",
                    padding: "10px",
                    fontSize: "12px",
                    color: "#ffffff",
                    fontFamily: "inherit",
                    resize: "vertical",
                    outline: "none",
                  }}
                />
              </div>

              {/* Min words input */}
              <div style={{ marginBottom: "20px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "rgba(255,255,255,0.4)",
                    marginBottom: "6px",
                  }}
                >
                  Min words required
                </label>
                <input
                  type="number"
                  value={minWords}
                  onChange={(e) => setMinWords(Number(e.target.value) || 0)}
                  style={{
                    width: "120px",
                    backgroundColor: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: "6px",
                    padding: "8px 10px",
                    fontSize: "12px",
                    color: "#ffffff",
                    fontFamily: "inherit",
                    outline: "none",
                  }}
                />
              </div>

              {/* Live display */}
              <div
                style={{
                  backgroundColor: "rgba(0,0,0,0.2)",
                  borderRadius: "6px",
                  padding: "16px",
                  marginBottom: "16px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "12px",
                    fontSize: "12px",
                  }}
                >
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>Word Count</span>
                  <span style={{ color: "#ffffff", fontWeight: 600 }}>
                    {wordCount} / {minWords} required
                  </span>
                </div>

                {/* Progress bar */}
                <div
                  style={{
                    width: "100%",
                    height: "4px",
                    backgroundColor: "rgba(255,255,255,0.1)",
                    borderRadius: "2px",
                    marginBottom: "16px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${progress}%`,
                      height: "100%",
                      backgroundColor: wouldPass ? "#FFE342" : "rgba(255,255,255,0.4)",
                      borderRadius: "2px",
                      transition: "width 0.3s ease, background-color 0.3s ease",
                    }}
                  />
                </div>

                {/* Hash */}
                <div style={{ marginBottom: "12px" }}>
                  <div
                    style={{
                      fontSize: "10px",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "rgba(255,255,255,0.4)",
                      marginBottom: "4px",
                    }}
                  >
                    SHA-256 Hash
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: hash ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.2)",
                      wordBreak: "break-all",
                      fontFamily: "monospace",
                    }}
                  >
                    {hash || "waiting for input..."}
                  </div>
                </div>

                {/* Status */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "13px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  <span
                    style={{
                      color: !text.trim()
                        ? "rgba(255,255,255,0.3)"
                        : wouldPass
                        ? "#FFE342"
                        : "#fca5a5",
                    }}
                  >
                    {!text.trim()
                      ? "AWAITING INPUT"
                      : wouldPass
                      ? "WOULD PASS"
                      : "WOULD FAIL"}
                  </span>
                </div>
              </div>

              {/* Execute Circuit Button */}
              <button
                onClick={executeCircuit}
                disabled={executing || !text.trim()}
                style={{
                  width: "100%",
                  fontFamily: "inherit",
                  fontSize: "12px",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontWeight: 600,
                  padding: "10px 0",
                  cursor: executing || !text.trim() ? "not-allowed" : "pointer",
                  border: "1px solid rgba(255,255,255,0.3)",
                  borderRadius: "6px",
                  backgroundColor: executing ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.1)",
                  color: executing || !text.trim() ? "rgba(255,255,255,0.3)" : "#ffffff",
                  backdropFilter: "blur(8px)",
                  transition: "all 0.15s ease",
                  marginBottom: circuitResult ? "16px" : "0",
                }}
              >
                {executing ? "Executing..." : "Execute Circuit"}
              </button>

              {/* Circuit Execution Result */}
              {circuitResult && (
                <div
                  style={{
                    backgroundColor: "rgba(0,0,0,0.3)",
                    borderRadius: "6px",
                    padding: "16px",
                    border: `1px solid ${circuitResult.passed ? "rgba(134,239,172,0.3)" : "rgba(252,165,165,0.3)"}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        color: circuitResult.passed ? "#FFE342" : "#fca5a5",
                      }}
                    >
                      {circuitResult.passed ? "PASS" : "FAIL"}
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "11px" }}>
                    <div>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>Cycle Count</div>
                      <div style={{ color: "#fff", fontFamily: "monospace" }}>{circuitResult.cycleCount.toLocaleString()}</div>
                    </div>
                    <div>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>Execution Time</div>
                      <div style={{ color: "#fff", fontFamily: "monospace" }}>{circuitResult.executionTime}</div>
                    </div>
                    <div>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>Word Count</div>
                      <div style={{ color: "#fff", fontFamily: "monospace" }}>{circuitResult.wordCount}</div>
                    </div>
                    <div>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>Hash Computed</div>
                      <div style={{ color: "#fff", fontFamily: "monospace", fontSize: "10px", wordBreak: "break-all" }}>
                        {circuitResult.textHash.slice(0, 16)}...
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Circuit test results */}
            <div style={{ ...glassCard, marginTop: "16px" }}>
              <div
                style={{
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "rgba(255,255,255,0.4)",
                  marginBottom: "12px",
                }}
              >
                Circuit Test Results (SP1 zkVM)
              </div>

              {CIRCUIT_TESTS.map((test) => (
                <div
                  key={test.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 12px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    marginBottom: "8px",
                    fontSize: "12px",
                  }}
                >
                  <div>
                    <div style={{ color: "#ffffff", marginBottom: "2px" }}>
                      Test {test.id}: {test.words} words, min={test.minWords}
                    </div>
                    <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>
                      {test.detail}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        fontWeight: 700,
                        color: test.pass ? "#FFE342" : "#fca5a5",
                        textTransform: "uppercase",
                        fontSize: "11px",
                      }}
                    >
                      {test.pass ? "PASS" : "FAIL"}
                    </div>
                    {test.cycles && (
                      <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>
                        {test.cycles.toLocaleString()} cycles
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
