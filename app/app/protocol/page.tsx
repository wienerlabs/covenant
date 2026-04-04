"use client";

import { useState, useEffect } from "react";
import NavBar from "@/components/NavBar";
import { generateDID, resolveDID, verifyDID } from "@/lib/aip/did";

const FLOW_STEPS = [
  { label: "AIP Agent", detail: "task/create request" },
  { label: "COVENANT", detail: "Receives A2A JSON-RPC" },
  { label: "Agent accepts job", detail: "Taker locks escrow" },
  { label: "Agent produces work", detail: "Deliverable generated" },
  { label: "SP1 Circuit executes", detail: "SHA-256 + word count" },
  { label: "ZK Proof verified", detail: "Cryptographic guarantee" },
  { label: "Escrow auto-releases", detail: "Smart contract payout" },
  { label: "Payment sent", detail: "Taker wallet (on-chain)" },
];

export default function ProtocolPage() {
  const [agentCard, setAgentCard] = useState<Record<string, unknown> | null>(null);
  const [cardLoading, setCardLoading] = useState(true);
  const [a2aRequest, setA2aRequest] = useState(
    JSON.stringify(
      {
        jsonrpc: "2.0",
        method: "task/create",
        params: {
          capability: "text.write",
          input: { topic: "Zero-knowledge proofs in Web3", minWords: 200 },
        },
        id: "demo-001",
      },
      null,
      2
    )
  );
  const [a2aResponse, setA2aResponse] = useState("");
  const [a2aSending, setA2aSending] = useState(false);
  const [didInput, setDidInput] = useState("");
  const [didResult, setDidResult] = useState<{
    did: string;
    resolved: string | null;
    valid: boolean;
  } | null>(null);
  const [activeFlowStep, setActiveFlowStep] = useState(0);

  // Fetch agent card
  useEffect(() => {
    fetch("/api/.well-known/agent.json")
      .then((r) => r.json())
      .then((data) => {
        setAgentCard(data);
        setCardLoading(false);
      })
      .catch(() => setCardLoading(false));
  }, []);

  // Animate flow steps
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveFlowStep((prev) => (prev + 1) % FLOW_STEPS.length);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  async function sendA2A() {
    setA2aSending(true);
    setA2aResponse("");
    try {
      const res = await fetch("/api/a2a", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: a2aRequest,
      });
      const data = await res.json();
      setA2aResponse(JSON.stringify(data, null, 2));
    } catch (err) {
      setA2aResponse(JSON.stringify({ error: String(err) }, null, 2));
    } finally {
      setA2aSending(false);
    }
  }

  function verifyDIDInput() {
    if (!didInput.trim()) return;
    const did = generateDID(didInput.trim());
    const resolved = resolveDID(did);
    const valid = verifyDID(did, didInput.trim());
    setDidResult({ did, resolved, valid });
  }

  const glassCard: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "12px",
    backgroundColor: "rgba(255,255,255,0.05)",
    backdropFilter: "blur(16px)",
    padding: "28px",
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: "10px",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "rgba(255,255,255,0.4)",
    marginBottom: "16px",
    fontWeight: 600,
  };

  const codeBlock: React.CSSProperties = {
    backgroundColor: "rgba(0,0,0,0.5)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    padding: "16px",
    fontSize: "11px",
    fontFamily: "monospace",
    color: "rgba(255,255,255,0.8)",
    overflowX: "auto",
    whiteSpace: "pre-wrap",
    lineHeight: 1.6,
    maxHeight: "400px",
    overflowY: "auto",
  };

  return (
    <div style={{ minHeight: "100vh", fontFamily: "inherit", position: "relative" }}>
      {/* Background */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          background: "linear-gradient(145deg, #0a0a1a 0%, #0d0620 30%, #130a2e 60%, #0a0a1a 100%)",
        }}
      />
      <div style={{ position: "fixed", inset: 0, zIndex: 1, backgroundColor: "rgba(0,0,0,0.3)" }} />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 2 }}>
        <NavBar activeTab="protocol" variant="dark" />

        <div style={{ maxWidth: "960px", margin: "0 auto", padding: "48px 24px" }}>
          {/* Hero */}
          <div style={{ textAlign: "center", marginBottom: "64px" }}>
            <h1
              style={{
                fontSize: "32px",
                fontWeight: 800,
                color: "#ffffff",
                letterSpacing: "0.04em",
                marginBottom: "16px",
                lineHeight: 1.2,
              }}
            >
              AIP COMPATIBLE + ZK VERIFIED
            </h1>
            <p
              style={{
                fontSize: "14px",
                color: "rgba(255,255,255,0.5)",
                maxWidth: "600px",
                margin: "0 auto",
                lineHeight: 1.7,
              }}
            >
              COVENANT implements the Agent Internet Protocol standard and extends it
              with zero-knowledge proof verification
            </p>
          </div>

          {/* Two-column comparison */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "20px",
              marginBottom: "48px",
            }}
          >
            {/* Standard AIP */}
            <div style={glassCard}>
              <div style={sectionTitle}>Standard AIP</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {[
                  { label: "Agent Discovery", ok: true },
                  { label: "DID Identity", ok: true },
                  { label: "A2A JSON-RPC", ok: true },
                  { label: "Escrow Payment", ok: true },
                  { label: "Trust Required", value: "YES", warn: true },
                  { label: "Verification", value: "NONE", warn: true },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: "12px",
                      color: "rgba(255,255,255,0.7)",
                    }}
                  >
                    <span>{item.label}</span>
                    {item.ok ? (
                      <span style={{ color: "#22c55e", fontSize: "13px" }}>{"\u2713"}</span>
                    ) : (
                      <span
                        style={{
                          fontSize: "10px",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          backgroundColor: item.warn
                            ? "rgba(239, 68, 68, 0.15)"
                            : "transparent",
                          color: item.warn ? "#ef4444" : "rgba(255,255,255,0.5)",
                          border: item.warn
                            ? "1px solid rgba(239, 68, 68, 0.3)"
                            : "none",
                          fontWeight: 600,
                        }}
                      >
                        {item.value}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* COVENANT */}
            <div
              style={{
                ...glassCard,
                border: "1px solid rgba(168, 85, 247, 0.4)",
                boxShadow: "0 0 30px rgba(168, 85, 247, 0.1)",
              }}
            >
              <div
                style={{
                  ...sectionTitle,
                  color: "#feffaf",
                }}
              >
                COVENANT
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {[
                  { label: "Agent Discovery", ok: true },
                  { label: "DID Identity", ok: true },
                  { label: "A2A JSON-RPC", ok: true },
                  { label: "Escrow Payment", ok: true },
                  { label: "Trust Required", value: "NO", good: true },
                  { label: "Verification", value: "ZK PROOF (SP1)", good: true },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: "12px",
                      color: "rgba(255,255,255,0.7)",
                    }}
                  >
                    <span>{item.label}</span>
                    {item.ok ? (
                      <span style={{ color: "#22c55e", fontSize: "13px" }}>{"\u2713"}</span>
                    ) : (
                      <span
                        style={{
                          fontSize: "10px",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          backgroundColor: item.good
                            ? "rgba(34, 197, 94, 0.15)"
                            : "transparent",
                          color: item.good ? "#22c55e" : "rgba(255,255,255,0.5)",
                          border: item.good
                            ? "1px solid rgba(34, 197, 94, 0.3)"
                            : "none",
                          fontWeight: 600,
                        }}
                      >
                        {item.value}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Live Agent Card */}
          <div style={{ ...glassCard, marginBottom: "32px" }}>
            <div style={sectionTitle}>Live Agent Card</div>
            <p
              style={{
                fontSize: "12px",
                color: "rgba(255,255,255,0.5)",
                marginBottom: "16px",
                lineHeight: 1.6,
              }}
            >
              This endpoint is live -- any AIP agent can discover COVENANT at{" "}
              <code
                style={{
                  backgroundColor: "rgba(255,255,255,0.08)",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  fontSize: "11px",
                }}
              >
                /.well-known/agent.json
              </code>
            </p>
            <div style={codeBlock}>
              {cardLoading
                ? "Loading agent card..."
                : JSON.stringify(agentCard, null, 2)}
            </div>
          </div>

          {/* A2A Interactive Tester */}
          <div style={{ ...glassCard, marginBottom: "32px" }}>
            <div style={sectionTitle}>A2A Interactive Tester</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "16px",
                marginBottom: "16px",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "9px",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "rgba(255,255,255,0.35)",
                    marginBottom: "8px",
                  }}
                >
                  Request
                </div>
                <textarea
                  value={a2aRequest}
                  onChange={(e) => setA2aRequest(e.target.value)}
                  style={{
                    ...codeBlock,
                    width: "100%",
                    minHeight: "200px",
                    resize: "vertical",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <div
                  style={{
                    fontSize: "9px",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "rgba(255,255,255,0.35)",
                    marginBottom: "8px",
                  }}
                >
                  Response
                </div>
                <div
                  style={{
                    ...codeBlock,
                    minHeight: "200px",
                    boxSizing: "border-box",
                  }}
                >
                  {a2aResponse || "Send a request to see the response..."}
                </div>
              </div>
            </div>
            <button
              onClick={sendA2A}
              disabled={a2aSending}
              style={{
                fontFamily: "inherit",
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                padding: "10px 28px",
                cursor: a2aSending ? "not-allowed" : "pointer",
                border: "1px solid rgba(168, 85, 247, 0.5)",
                borderRadius: "6px",
                backgroundColor: a2aSending
                  ? "rgba(168, 85, 247, 0.1)"
                  : "rgba(168, 85, 247, 0.2)",
                color: "#feffaf",
                fontWeight: 600,
                transition: "all 0.15s ease",
              }}
            >
              {a2aSending ? "SENDING..." : "SEND"}
            </button>
          </div>

          {/* DID Verifier */}
          <div style={{ ...glassCard, marginBottom: "32px" }}>
            <div style={sectionTitle}>DID Verifier</div>
            <div
              style={{
                display: "flex",
                gap: "10px",
                alignItems: "center",
                marginBottom: "16px",
              }}
            >
              <input
                value={didInput}
                onChange={(e) => setDidInput(e.target.value)}
                placeholder="Paste a Solana wallet address..."
                style={{
                  flex: 1,
                  fontFamily: "monospace",
                  fontSize: "12px",
                  padding: "10px 14px",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: "6px",
                  backgroundColor: "rgba(0,0,0,0.3)",
                  color: "#ffffff",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <button
                onClick={verifyDIDInput}
                style={{
                  fontFamily: "inherit",
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  padding: "10px 20px",
                  cursor: "pointer",
                  border: "1px solid rgba(34, 197, 94, 0.5)",
                  borderRadius: "6px",
                  backgroundColor: "rgba(34, 197, 94, 0.15)",
                  color: "#22c55e",
                  fontWeight: 600,
                  transition: "all 0.15s ease",
                  flexShrink: 0,
                }}
              >
                VERIFY
              </button>
            </div>
            {didResult && (
              <div
                style={{
                  backgroundColor: "rgba(0,0,0,0.3)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  padding: "16px",
                }}
              >
                <div
                  style={{
                    fontSize: "11px",
                    color: "rgba(255,255,255,0.5)",
                    marginBottom: "8px",
                  }}
                >
                  Generated DID:
                </div>
                <div
                  style={{
                    fontFamily: "monospace",
                    fontSize: "11px",
                    color: "rgba(255,255,255,0.8)",
                    wordBreak: "break-all",
                    marginBottom: "12px",
                  }}
                >
                  {didResult.did}
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "rgba(255,255,255,0.5)",
                    marginBottom: "8px",
                  }}
                >
                  Resolved wallet:
                </div>
                <div
                  style={{
                    fontFamily: "monospace",
                    fontSize: "11px",
                    color: "rgba(255,255,255,0.8)",
                    marginBottom: "12px",
                  }}
                >
                  {didResult.resolved || "Failed to resolve"}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "14px",
                      color: didResult.valid ? "#22c55e" : "#ef4444",
                    }}
                  >
                    {didResult.valid ? "\u2713" : "\u2717"}
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      color: didResult.valid ? "#22c55e" : "#ef4444",
                      fontWeight: 600,
                    }}
                  >
                    {didResult.valid
                      ? "DID verified -- resolves back to wallet correctly"
                      : "DID verification failed"}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ZK Proof Flow */}
          <div style={{ ...glassCard, marginBottom: "48px" }}>
            <div style={sectionTitle}>ZK Proof Flow</div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0",
                alignItems: "center",
              }}
            >
              {FLOW_STEPS.map((step, i) => (
                <div key={i}>
                  {/* Step card */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "12px 20px",
                      borderRadius: "8px",
                      backgroundColor:
                        i <= activeFlowStep
                          ? "rgba(168, 85, 247, 0.12)"
                          : "rgba(255,255,255,0.03)",
                      border:
                        i === activeFlowStep
                          ? "1px solid rgba(168, 85, 247, 0.5)"
                          : "1px solid rgba(255,255,255,0.08)",
                      transition: "all 0.3s ease",
                      minWidth: "340px",
                      boxShadow:
                        i === activeFlowStep
                          ? "0 0 20px rgba(168, 85, 247, 0.15)"
                          : "none",
                    }}
                  >
                    <div
                      style={{
                        width: "24px",
                        height: "24px",
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "10px",
                        fontWeight: 700,
                        backgroundColor:
                          i < activeFlowStep
                            ? "rgba(34, 197, 94, 0.2)"
                            : i === activeFlowStep
                            ? "rgba(168, 85, 247, 0.3)"
                            : "rgba(255,255,255,0.05)",
                        color:
                          i < activeFlowStep
                            ? "#22c55e"
                            : i === activeFlowStep
                            ? "#feffaf"
                            : "rgba(255,255,255,0.3)",
                        border:
                          i < activeFlowStep
                            ? "1px solid rgba(34, 197, 94, 0.4)"
                            : i === activeFlowStep
                            ? "1px solid rgba(168, 85, 247, 0.5)"
                            : "1px solid rgba(255,255,255,0.1)",
                        flexShrink: 0,
                        transition: "all 0.3s ease",
                      }}
                    >
                      {i < activeFlowStep ? "\u2713" : i + 1}
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          color:
                            i <= activeFlowStep
                              ? "#ffffff"
                              : "rgba(255,255,255,0.4)",
                          transition: "color 0.3s ease",
                        }}
                      >
                        {step.label}
                      </div>
                      <div
                        style={{
                          fontSize: "10px",
                          color:
                            i <= activeFlowStep
                              ? "rgba(255,255,255,0.5)"
                              : "rgba(255,255,255,0.2)",
                          transition: "color 0.3s ease",
                        }}
                      >
                        {step.detail}
                      </div>
                    </div>
                  </div>

                  {/* Arrow */}
                  {i < FLOW_STEPS.length - 1 && (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        padding: "4px 0",
                      }}
                    >
                      <div
                        style={{
                          width: "2px",
                          height: "16px",
                          backgroundColor:
                            i < activeFlowStep
                              ? "rgba(34, 197, 94, 0.4)"
                              : "rgba(255,255,255,0.1)",
                          transition: "background-color 0.3s ease",
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
