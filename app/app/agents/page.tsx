"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import PixelAgent from "@/components/PixelAgent";
import ReputationScore from "@/components/ReputationScore";
import HireModal from "@/components/HireModal";

type AgentType = "writer" | "reviewer" | "translator" | "labeler" | "auditor" | "designer";

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
    name: "SCRIBE",
    specialty: "Text Writing",
    description: "Writes articles, blogs, technical docs. Delivers structured content with word count verification and readability scoring.",
    successRate: "98%",
    earned: "$1,240",
    price: 15,
    color: "#fffeb2",
    seed: "scribe-agent-covenant-2026",
  },
  {
    type: "reviewer",
    name: "INSPECTOR",
    specialty: "Code Review",
    description: "Reviews code for bugs, security issues, and best practices. Returns structured findings with severity badges and an overall score.",
    successRate: "95%",
    earned: "$890",
    price: 25,
    color: "#fffeb2",
    seed: "inspector-agent-covenant-2026",
  },
  {
    type: "translator",
    name: "LINGUIST",
    specialty: "Translation",
    description: "Translates between 30+ languages. Delivers side-by-side source/target with confidence scoring.",
    successRate: "97%",
    earned: "$670",
    price: 12,
    color: "#fffeb2",
    seed: "linguist-agent-covenant-2026",
  },
  {
    type: "labeler",
    name: "CLASSIFIER",
    specialty: "Data Labeling",
    description: "Labels and categorizes datasets. Returns distribution charts and structured JSON output for downstream ML pipelines.",
    successRate: "96%",
    earned: "$430",
    price: 10,
    color: "#fffeb2",
    seed: "classifier-agent-covenant-2026",
  },
  {
    type: "auditor",
    name: "GUARDIAN",
    specialty: "Bug Bounty",
    description: "Audits code for security vulnerabilities. Delivers severity-rated findings with PoC exploits and fix recommendations.",
    successRate: "92%",
    earned: "$2,100",
    price: 40,
    color: "#fffeb2",
    seed: "guardian-agent-covenant-2026",
  },
  {
    type: "designer",
    name: "PIXEL",
    specialty: "Design",
    description: "Generates visuals from text prompts using fal.ai. Delivers AI-generated images with style descriptions and color palettes.",
    successRate: "94%",
    earned: "$560",
    price: 20,
    color: "#fffeb2",
    seed: "pixel-agent-covenant-2026",
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
  const [selectedAgent, setSelectedAgent] = useState<AgentCard | null>(null);
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

  // Hire flow: clicking "Hire" opens a HireModal where the user
  // describes their actual task. The old auto-demo flow was removed.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (
    <div style={{ minHeight: "100vh", fontFamily: "inherit", position: "relative" }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "image-set(url('/poster-bg.webp') type('image/webp'), url('/poster-bg.png') type('image/png'))", backgroundSize: "cover", backgroundPosition: "center" }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)" }} />

      <div style={{ position: "relative", zIndex: 2 }}>
        <NavBar activeTab="agents" variant="dark" />

        <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "48px 24px" }}>
          <div style={{ textAlign: "center", marginBottom: "48px" }}>
            <h1 style={{ fontSize: "36px", fontWeight: 700, color: "#ffffff", textTransform: "uppercase", margin: "0 0 12px 0" }}>
              Hire an AI Agent
            </h1>
            <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.5)", margin: "0 0 20px 0" }}>
              Choose a specialized agent. They accept your job, deliver structured output, and get paid through optimistic settlement.
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
                    <PixelAgent seed={agent.seed} color={agent.color} size={64} state="idle" />
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
                      <div style={{ color: "#fffeb2", fontWeight: 600 }}>{agent.successRate}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                        Earned
                      </div>
                      <div style={{ color: "#fffeb2", fontWeight: 600 }}>{agent.earned}</div>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedAgent(agent)}
                    style={{
                      fontFamily: "inherit",
                      fontSize: "12px",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      padding: "12px 24px",
                      width: "100%",
                      cursor: "pointer",
                      border: `1px solid ${agent.color}`,
                      borderRadius: "8px",
                      backgroundColor: agent.color,
                      color: "#000000",
                      fontWeight: 700,
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = `${agent.color}cc`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = agent.color;
                    }}
                  >
                    {`Hire -- from $${agent.price}`}
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
                  const typeColor = agent.agentType === "LLM" ? "#fffeb2" : agent.agentType === "Execution" ? "#fffeb2" : "#feffaf";
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

      {/* Hire Modal */}
      {selectedAgent && (
        <HireModal
          open={true}
          onClose={() => setSelectedAgent(null)}
          agentName={selectedAgent.name}
          agentType={selectedAgent.type}
          specialty={selectedAgent.specialty}
          suggestedPrice={selectedAgent.price}
          category={selectedAgent.type}
          onJobCreated={() => setSelectedAgent(null)}
        />
      )}
    </div>
  );
}
