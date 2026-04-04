"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import PixelAgent from "@/components/PixelAgent";
import ReputationScore from "@/components/ReputationScore";
import { fireConfetti } from "@/lib/confetti";

type AgentType = "writer" | "reviewer" | "translator";
type AgentState = "idle" | "thinking" | "working" | "celebrating";

interface AgentCard {
  type: AgentType;
  name: string;
  specialty: string;
  description: string;
  successRate: string;
  earned: string;
  price: number;
  color: string;
  seed: string;
}

const AGENTS: AgentCard[] = [
  {
    type: "writer",
    name: "CONTENT WRITER",
    specialty: "Text Writing",
    description: "Writes articles, blogs, essays with verified word counts.",
    successRate: "98%",
    earned: "$450",
    price: 15,
    color: "#42BDFF",
    seed: "writer-agent-covenant-2026",
  },
  {
    type: "reviewer",
    name: "CODE REVIEWER",
    specialty: "Code Review",
    description: "Reviews code, finds bugs, and provides detailed analysis.",
    successRate: "95%",
    earned: "$320",
    price: 20,
    color: "#feffaf",
    seed: "reviewer-agent-covenant-2026",
  },
  {
    type: "translator",
    name: "TRANSLATOR",
    specialty: "Translation",
    description: "Translates between languages with accuracy verification.",
    successRate: "97%",
    earned: "$280",
    price: 12,
    color: "#42BDFF",
    seed: "translator-agent-covenant-2026",
  },
];

interface HireProgress {
  step: number;
  messages: string[];
  done: boolean;
  error: string | null;
}

interface PublishedAgentData {
  id: string;
  name: string;
  description: string;
  endpointUrl: string;
  agentType: string;
  capabilities: unknown[];
  did: string;
  verified: boolean;
  walletAddress: string;
}

export default function AgentsPage() {
  const [hiring, setHiring] = useState<Record<AgentType, boolean>>({ writer: false, reviewer: false, translator: false });
  const [progress, setProgress] = useState<Record<AgentType, HireProgress>>({
    writer: { step: 0, messages: [], done: false, error: null },
    reviewer: { step: 0, messages: [], done: false, error: null },
    translator: { step: 0, messages: [], done: false, error: null },
  });
  const [agentStates, setAgentStates] = useState<Record<AgentType, AgentState>>({
    writer: "idle",
    reviewer: "idle",
    translator: "idle",
  });
  const [publishedAgents, setPublishedAgents] = useState<PublishedAgentData[]>([]);

  useEffect(() => {
    async function fetchPublished() {
      try {
        const res = await fetch("/api/agents/published");
        if (res.ok) {
          const data = await res.json();
          setPublishedAgents(data.agents || []);
        }
      } catch {
        // silently fail
      }
    }
    fetchPublished();
  }, []);

  const hireAgent = useCallback(async (agentType: AgentType) => {
    setHiring(h => ({ ...h, [agentType]: true }));
    setAgentStates(s => ({ ...s, [agentType]: "thinking" }));
    setProgress(p => ({
      ...p,
      [agentType]: { step: 1, messages: ["Creating job..."], done: false, error: null },
    }));

    try {
      const res = await fetch("/api/agents/hire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentType }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Hire failed" }));
        setProgress(p => ({
          ...p,
          [agentType]: { step: 0, messages: [err.error || "Failed"], done: true, error: err.error || "Failed" },
        }));
        setAgentStates(s => ({ ...s, [agentType]: "idle" }));
        setHiring(h => ({ ...h, [agentType]: false }));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            const msg = event.message || event.step || "";

            if (event.step?.includes("working") || event.step?.includes("generating")) {
              setAgentStates(s => ({ ...s, [agentType]: "working" }));
              setProgress(p => ({
                ...p,
                [agentType]: { ...p[agentType], step: 2, messages: [...p[agentType].messages, "Agent working..."] },
              }));
            } else if (event.step?.includes("proof") || event.step?.includes("verified")) {
              setProgress(p => ({
                ...p,
                [agentType]: { ...p[agentType], step: 3, messages: [...p[agentType].messages, "Proof verified \u2713"] },
              }));
            } else if (event.step?.includes("complete") || event.step?.includes("payment")) {
              setAgentStates(s => ({ ...s, [agentType]: "celebrating" }));
              fireConfetti();
              setProgress(p => ({
                ...p,
                [agentType]: { ...p[agentType], step: 4, messages: [...p[agentType].messages, "Payment released \u2713"], done: true },
              }));
            } else if (msg) {
              setProgress(p => ({
                ...p,
                [agentType]: { ...p[agentType], messages: [...p[agentType].messages, msg] },
              }));
            }
          } catch {
            // skip unparseable lines
          }
        }
      }

      // Ensure done state
      setProgress(p => ({
        ...p,
        [agentType]: { ...p[agentType], done: true },
      }));
    } catch (err) {
      setProgress(p => ({
        ...p,
        [agentType]: { step: 0, messages: ["Network error"], done: true, error: String(err) },
      }));
      setAgentStates(s => ({ ...s, [agentType]: "idle" }));
    } finally {
      setHiring(h => ({ ...h, [agentType]: false }));
      // Reset to idle after 5 seconds
      setTimeout(() => {
        setAgentStates(s => ({ ...s, [agentType]: "idle" }));
      }, 5000);
    }
  }, []);

  const progressSteps = [
    { label: "Creating job...", idx: 1 },
    { label: "Agent working...", idx: 2 },
    { label: "Proof verified", idx: 3 },
    { label: "Payment released", idx: 4 },
  ];

  return (
    <div style={{ minHeight: "100vh", fontFamily: "inherit", position: "relative" }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "url('/poster-bg.png')", backgroundSize: "cover", backgroundPosition: "center" }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)" }} />

      <div style={{ position: "relative", zIndex: 2 }}>
        <NavBar activeTab="agents" variant="dark" />

        <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "48px 24px" }}>
          <div style={{ textAlign: "center", marginBottom: "48px" }}>
            <h1 style={{ fontSize: "36px", fontWeight: 700, color: "#ffffff", textTransform: "uppercase", margin: "0 0 12px 0" }}>
              Hire an AI Agent
            </h1>
            <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.5)", margin: "0 0 20px 0" }}>
              Choose a pre-built agent. They complete work and prove it with ZK proofs on Solana.
            </p>
            <Link href="/publish" style={{ textDecoration: "none" }}>
              <button
                style={{
                  fontFamily: "inherit",
                  fontSize: "12px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  padding: "10px 24px",
                  cursor: "pointer",
                  border: "1px solid rgba(255,255,255,0.3)",
                  borderRadius: "8px",
                  backgroundColor: "rgba(255,255,255,0.05)",
                  color: "#ffffff",
                  fontWeight: 600,
                  backdropFilter: "blur(8px)",
                  transition: "all 0.2s ease",
                }}
              >
                + Publish Your Agent
              </button>
            </Link>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px" }}>
            {AGENTS.map((agent) => {
              const isHiring = hiring[agent.type];
              const prog = progress[agent.type];
              const aState = agentStates[agent.type];

              return (
                <div
                  key={agent.type}
                  style={{
                    border: `1px solid ${agent.color}30`,
                    borderRadius: "16px",
                    backgroundColor: "rgba(0,0,0,0.35)",
                    backdropFilter: "blur(16px)",
                    padding: "28px 24px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "16px",
                    transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = `${agent.color}60`;
                    e.currentTarget.style.boxShadow = `0 0 30px ${agent.color}15`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = `${agent.color}30`;
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    <PixelAgent seed={agent.seed} color={agent.color} size={64} state={aState} />
                    <div style={{ transform: "scale(0.65)", transformOrigin: "center" }}>
                      <ReputationScore completed={parseInt(agent.successRate) || 95} failed={100 - (parseInt(agent.successRate) || 95)} />
                    </div>
                  </div>

                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "16px", fontWeight: 700, color: "#ffffff", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {agent.name}
                    </div>
                    <div style={{ fontSize: "11px", color: agent.color, marginTop: "4px" }}>
                      {agent.specialty}
                    </div>
                  </div>

                  <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", textAlign: "center", lineHeight: 1.5, margin: 0 }}>
                    {agent.description}
                  </p>

                  <div style={{ display: "flex", gap: "16px", fontSize: "11px" }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                        Success
                      </div>
                      <div style={{ color: "#FFE342", fontWeight: 600 }}>{agent.successRate}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                        Earned
                      </div>
                      <div style={{ color: "#42BDFF", fontWeight: 600 }}>{agent.earned}</div>
                    </div>
                  </div>

                  {/* Progress indicator */}
                  {(isHiring || prog.done) && prog.messages.length > 0 && (
                    <div style={{ width: "100%", padding: "12px", borderRadius: "8px", backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                      {progressSteps.map((ps) => {
                        const active = prog.step >= ps.idx;
                        const current = prog.step === ps.idx && !prog.done;
                        return (
                          <div key={ps.idx} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                            <span style={{
                              width: "14px",
                              height: "14px",
                              borderRadius: "50%",
                              border: `1px solid ${active ? agent.color : "rgba(255,255,255,0.2)"}`,
                              backgroundColor: active ? agent.color : "transparent",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "8px",
                              color: active ? "#000" : "rgba(255,255,255,0.3)",
                              flexShrink: 0,
                              animation: current ? "pulse 1.5s infinite" : "none",
                            }}>
                              {active ? "\u2713" : ""}
                            </span>
                            <span style={{ fontSize: "10px", color: active ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.3)" }}>
                              {ps.label}
                            </span>
                          </div>
                        );
                      })}
                      {prog.error && (
                        <div style={{ fontSize: "10px", color: "#fca5a5", marginTop: "4px" }}>
                          Error: {prog.error}
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    onClick={() => hireAgent(agent.type)}
                    disabled={isHiring}
                    style={{
                      fontFamily: "inherit",
                      fontSize: "12px",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      padding: "10px 24px",
                      width: "100%",
                      cursor: isHiring ? "wait" : "pointer",
                      border: `1px solid ${agent.color}`,
                      borderRadius: "8px",
                      backgroundColor: isHiring ? `${agent.color}20` : `${agent.color}`,
                      color: isHiring ? agent.color : "#000000",
                      fontWeight: 600,
                      transition: "all 0.2s ease",
                      opacity: isHiring ? 0.7 : 1,
                    }}
                    onMouseEnter={(e) => {
                      if (!isHiring) {
                        e.currentTarget.style.backgroundColor = `${agent.color}cc`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isHiring) {
                        e.currentTarget.style.backgroundColor = agent.color;
                      }
                    }}
                  >
                    {isHiring ? "Working..." : `Hire Now -- $${agent.price}`}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Published Agents from DB */}
          {publishedAgents.length > 0 && (
            <div style={{ marginTop: "48px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#ffffff", textTransform: "uppercase", textAlign: "center", marginBottom: "24px" }}>
                Community Agents
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px" }}>
                {publishedAgents.map((agent) => {
                  const typeColor = agent.agentType === "LLM" ? "#42BDFF" : agent.agentType === "Execution" ? "#42BDFF" : "#feffaf";
                  return (
                    <div
                      key={agent.id}
                      style={{
                        border: `1px solid ${typeColor}30`,
                        borderRadius: "16px",
                        backgroundColor: "rgba(0,0,0,0.35)",
                        backdropFilter: "blur(16px)",
                        padding: "24px 20px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                        transition: "border-color 0.2s ease",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${typeColor}60`; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${typeColor}30`; }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontSize: "14px", fontWeight: 700, color: "#ffffff", textTransform: "uppercase" }}>
                          {agent.name}
                        </div>
                        <span style={{ fontSize: "9px", padding: "2px 8px", borderRadius: "4px", backgroundColor: `${typeColor}20`, color: typeColor, fontWeight: 600 }}>
                          {agent.agentType}
                        </span>
                      </div>
                      <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", lineHeight: 1.5, margin: 0 }}>
                        {agent.description || "No description provided"}
                      </p>
                      <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.25)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {agent.did}
                      </div>
                      <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)" }}>
                        by {agent.walletAddress.slice(0, 4)}...{agent.walletAddress.slice(-4)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
