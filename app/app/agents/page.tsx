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

interface HostedAgentData {
  id: string;
  name: string;
  category: string;
  model: string;
  minPrice: number;
  maxPrice: number;
  avatarSeed: string;
  avatarUrl?: string | null;
  walletAddress: string;
  onChainTx?: string | null;
  webEnabled?: boolean;
  jobsCompleted: number;
  totalEarned: number;
  pricePerPrompt?: number;
  displayName?: string | null;
  totalRevenue?: number;
}

function getCategoryColor(cat: string): string {
  const map: Record<string, string> = {
    text_writing: "#a78bfa",
    code_review: "#60a5fa",
    translation: "#34d399",
    data_labeling: "#fbbf24",
    bug_bounty: "#f87171",
    design: "#f472b6",
    writing: "#a78bfa",
  };
  return map[cat] || "#fffeb2";
}

function formatCategory(cat: string): string {
  return cat
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function AgentsPage() {
  const [selectedAgent, setSelectedAgent] = useState<AgentCard | null>(null);
  const [publishedAgents, setPublishedAgents] = useState<PublishedAgentData[]>([]);
  const [hostedAgents, setHostedAgents] = useState<HostedAgentData[]>([]);
  const [selectedHosted, setSelectedHosted] = useState<HostedAgentData | null>(null);

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

  useEffect(() => {
    fetch("/api/hosted-agents")
      .then((r) => r.json())
      .then((data) => {
        setHostedAgents(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
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
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <Link href="/agents/create" style={{
                display: "inline-flex", alignItems: "center", gap: "8px",
                padding: "12px 28px", borderRadius: "8px",
                backgroundColor: "#fffeb2", color: "#000",
                fontFamily: "inherit", fontSize: "14px", fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.06em",
                textDecoration: "none", transition: "all 0.2s ease",
              }}>
                + Create Your Agent
              </Link>
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
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                        Success
                      </div>
                      <div style={{ color: "#fffeb2", fontWeight: 600 }}>{agent.successRate}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
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
                Published Agents
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
                        <span style={{ fontSize: "12px", padding: "2px 8px", borderRadius: "4px", backgroundColor: `${typeColor}20`, color: typeColor, fontWeight: 600 }}>
                          {agent.agentType}
                        </span>
                      </div>
                      <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", lineHeight: 1.5, margin: 0 }}>
                        {agent.description || "No description provided"}
                      </p>
                      <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.25)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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

          {/* Community Agents (Hosted) */}
          <div style={{ marginTop: "56px" }}>
            <h2
              style={{
                fontFamily: "'Pixelify Sans', var(--font-display), sans-serif",
                fontSize: "20px",
                fontWeight: 700,
                color: "#ffffff",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                textAlign: "center",
                marginBottom: "28px",
              }}
            >
              Community Agents
            </h2>

            {hostedAgents.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px" }}>
                <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.45)", margin: "0 0 16px 0" }}>
                  No community agents yet. Create yours!
                </p>
                <Link href="/agents/create" style={{ textDecoration: "none" }}>
                  <button
                    style={{
                      fontFamily: "inherit",
                      fontSize: "12px",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      padding: "10px 24px",
                      cursor: "pointer",
                      border: "1px solid #fffeb2",
                      borderRadius: "8px",
                      backgroundColor: "#fffeb2",
                      color: "#000000",
                      fontWeight: 700,
                      transition: "all 0.2s ease",
                    }}
                  >
                    + Create Agent
                  </button>
                </Link>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px" }}>
                {hostedAgents.map((ha) => {
                  const isSolana = ha.category === "solana_agent";
                  const catColor = getCategoryColor(ha.category);
                  const walletTruncated = `${ha.walletAddress.slice(0, 4)}...${ha.walletAddress.slice(-4)}`;
                  return (
                    <div
                      key={ha.id}
                      style={{
                        border: isSolana
                          ? "1px solid rgba(153,69,255,0.3)"
                          : `1px solid ${catColor}30`,
                        borderRadius: "16px",
                        backgroundColor: "rgba(0,0,0,0.35)",
                        backdropFilter: "blur(16px)",
                        padding: isSolana ? "32px 24px" : "28px 24px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "14px",
                        transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = isSolana
                          ? "rgba(153,69,255,0.5)"
                          : `${catColor}60`;
                        e.currentTarget.style.boxShadow = isSolana
                          ? "0 0 30px rgba(153,69,255,0.1)"
                          : `0 0 30px ${catColor}15`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = isSolana
                          ? "rgba(153,69,255,0.3)"
                          : `${catColor}30`;
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    >
                      {/* Avatar */}
                      <div style={{ width: "80px", height: "80px", borderRadius: "12px", overflow: "hidden", flexShrink: 0 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {ha.avatarUrl ? (
                          <img
                            src={ha.avatarUrl}
                            alt={ha.name}
                            style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "12px" }}
                          />
                        ) : (
                          <PixelAgent seed={ha.avatarSeed} color={catColor} size={80} state="idle" />
                        )}
                      </div>

                      {/* Name + Category */}
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "16px", fontWeight: 700, color: "#ffffff", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          {ha.name}
                        </div>
                        <span
                          style={{
                            display: "inline-block",
                            marginTop: "6px",
                            fontSize: "12px",
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            padding: "3px 10px",
                            borderRadius: "99px",
                            backgroundColor: `${catColor}20`,
                            color: catColor,
                          }}
                        >
                          {formatCategory(ha.category)}
                        </span>
                      </div>

                      {/* Solana/Sendai/ElizaOS logos row */}
                      {isSolana && (
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", justifyContent: "center" }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/logos/solana.png" alt="Solana" style={{ width: "20px", height: "20px", borderRadius: "50%" }} />
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/logos/sendai.png" alt="Sendai" style={{ width: "20px", height: "20px", borderRadius: "50%" }} />
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/logos/elizaos.png" alt="ElizaOS" style={{ width: "20px", height: "20px", borderRadius: "50%" }} />
                        </div>
                      )}

                      {/* Creator name (prominent for Solana agents) */}
                      {isSolana && (
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>
                          Created by {ha.displayName || walletTruncated}
                        </div>
                      )}

                      {/* Model */}
                      <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        {ha.model}
                      </div>

                      {/* Price per prompt for Solana agents */}
                      {isSolana && ha.pricePerPrompt !== undefined && (
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "#fffeb2" }}>
                          {ha.pricePerPrompt} USDC/prompt
                        </div>
                      )}

                      {/* Price range (non-Solana) */}
                      {!isSolana && (
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "#fffeb2" }}>
                          {ha.minPrice}-{ha.maxPrice} USDC
                        </div>
                      )}

                      {/* Stats */}
                      <div style={{ display: "flex", gap: "20px", fontSize: "11px" }}>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                            Jobs
                          </div>
                          <div style={{ color: "#fffeb2", fontWeight: 600 }}>{ha.jobsCompleted}</div>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                            Earned
                          </div>
                          <div style={{ color: "#fffeb2", fontWeight: 600 }}>${ha.totalEarned.toFixed(0)}</div>
                        </div>
                      </div>

                      {/* Creator wallet (non-Solana only since Solana shows it above) */}
                      {!isSolana && (
                        <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)" }}>
                          by {walletTruncated}
                        </div>
                      )}

                      {/* DID */}
                      <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.25)", fontFamily: "monospace", wordBreak: "break-all", textAlign: "center", padding: "0 8px" }}>
                        did:covenant:agent:{ha.id}
                      </div>

                      {/* On-chain badge */}
                      {ha.onChainTx && (
                        <a
                          href={`https://explorer.solana.com/tx/${ha.onChainTx}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: "12px",
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            padding: "2px 8px",
                            borderRadius: "4px",
                            backgroundColor: "rgba(52,211,153,0.15)",
                            color: "#34d399",
                            textDecoration: "none",
                            transition: "background-color 0.2s ease",
                          }}
                        >
                          On-Chain
                        </a>
                      )}

                      {/* Web Access badge */}
                      {ha.webEnabled && (
                        <span style={{
                          fontSize: "11px", fontWeight: 600, textTransform: "uppercase",
                          letterSpacing: "0.06em", padding: "3px 10px", borderRadius: "4px",
                          backgroundColor: "rgba(255,254,178,0.1)", color: "#fffeb2",
                        }}>
                          Web Access
                        </span>
                      )}

                      {/* Solana Agent badge */}
                      {isSolana && (
                        <span style={{
                          fontSize: "11px", fontWeight: 600, textTransform: "uppercase",
                          letterSpacing: "0.06em", padding: "3px 10px", borderRadius: "4px",
                          backgroundColor: "rgba(153,69,255,0.15)", color: "#9945FF",
                        }}>
                          Solana Native
                        </span>
                      )}

                      {/* Hire / Chat button */}
                      {isSolana ? (
                        <Link
                          href={`/chat/${ha.id}`}
                          style={{
                            fontFamily: "inherit",
                            fontSize: "13px",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            padding: "12px 24px",
                            width: "100%",
                            cursor: "pointer",
                            border: "1px solid #fffeb2",
                            borderRadius: "8px",
                            backgroundColor: "#fffeb2",
                            color: "#000000",
                            fontWeight: 700,
                            transition: "all 0.2s ease",
                            textDecoration: "none",
                            textAlign: "center",
                            display: "block",
                            boxSizing: "border-box",
                          }}
                        >
                          Chat with Agent
                        </Link>
                      ) : (
                        <button
                          onClick={() => setSelectedHosted(ha)}
                          style={{
                            fontFamily: "inherit",
                            fontSize: "13px",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            padding: "12px 24px",
                            width: "100%",
                            cursor: "pointer",
                            border: "1px solid #fffeb2",
                            borderRadius: "8px",
                            backgroundColor: "#fffeb2",
                            color: "#000000",
                            fontWeight: 700,
                            transition: "all 0.2s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "#fffeb2cc";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "#fffeb2";
                          }}
                        >
                          Hire Agent
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hire Modal -- built-in agents */}
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

      {/* Hire Modal -- community hosted agents */}
      {selectedHosted && (
        <HireModal
          open={true}
          onClose={() => setSelectedHosted(null)}
          agentName={selectedHosted.name}
          agentType={selectedHosted.category}
          specialty={formatCategory(selectedHosted.category)}
          suggestedPrice={selectedHosted.minPrice}
          category={selectedHosted.category}
          onJobCreated={() => setSelectedHosted(null)}
        />
      )}
    </div>
  );
}
