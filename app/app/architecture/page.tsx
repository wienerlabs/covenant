"use client";

import { useState } from "react";
import NavBar from "@/components/NavBar";

interface ArchComponent {
  id: string;
  icon: string;
  name: string;
  detail: string;
  row: number;
  col: number;
  expandedInfo: string;
}

const COMPONENTS: ArchComponent[] = [
  {
    id: "frontend",
    icon: "//",
    name: "Next.js 14 Frontend",
    detail: "TypeScript + Tailwind CSS",
    row: 0,
    col: 0,
    expandedInfo: "Server-side rendering with React 18. App Router. Inline styles matching the COVENANT design system with Pixelify Sans font and glass-morphism cards.",
  },
  {
    id: "wallet",
    icon: "{}",
    name: "ConnectorKit Wallet",
    detail: "Phantom, Solflare",
    row: 0,
    col: 2,
    expandedInfo: "ConnectorKit provides wallet adapter integration supporting Phantom, Solflare, and WalletConnect. Handles signing transactions for on-chain escrow operations.",
  },
  {
    id: "api",
    icon: "<>",
    name: "API Routes",
    detail: "Next.js Route Handlers",
    row: 1,
    col: 0,
    expandedInfo: "RESTful API routes handling job CRUD, profile management, reputation tracking, and submission verification. All routes use Prisma for database access.",
  },
  {
    id: "db",
    icon: "[]",
    name: "Neon PostgreSQL",
    detail: "5 tables, serverless",
    row: 1,
    col: 1,
    expandedInfo: "Neon serverless PostgreSQL with 5 tables: Job, Profile, Reputation, Submission, and system config. Auto-scaling with connection pooling.",
  },
  {
    id: "prisma",
    icon: "||",
    name: "Prisma ORM",
    detail: "Type-safe queries",
    row: 1,
    col: 2,
    expandedInfo: "Prisma Client provides type-safe database access with auto-generated TypeScript types. Schema-first approach with migrations for the Job, Profile, Reputation, and Submission models.",
  },
  {
    id: "solana",
    icon: ">>",
    name: "Solana Devnet",
    detail: "400ms finality",
    row: 2,
    col: 0,
    expandedInfo: "Solana Devnet cluster for development and testing. Sub-second transaction finality. USDC token escrow with SPL token program integration.",
  },
  {
    id: "anchor",
    icon: "##",
    name: "Anchor Program",
    detail: "HApt...PTNo",
    row: 2,
    col: 1,
    expandedInfo: "Anchor framework smart contract deployed at 5hstj5grBUL1BeSaPLYpgkD6n3ALasmbseRvKRFfCVNT. Manages escrow creation, acceptance, submission verification, and fund release.",
  },
  {
    id: "escrow",
    icon: "$$",
    name: "PDA Escrow",
    detail: "per-job, USDC-locked",
    row: 2,
    col: 2,
    expandedInfo: 'Each job locks USDC into a deterministic Program Derived Address derived from [b"job", poster, sha256(spec)]. Authority is the JobEscrow PDA itself — no shared deployer wallet. Funds auto-release to the taker after the 24h optimistic challenge window expires with no dispute, or get split per multisig resolution if disputed.',
  },
];

const DETAIL_CARDS = [
  {
    label: "Program ID",
    value: "5hstj5grBUL1BeSaPLYpgkD6n3ALasmbseRvKRFfCVNT",
  },
  {
    label: "Database",
    value: "Neon PostgreSQL (Prisma 6)",
  },
  {
    label: "Settlement",
    value: "Optimistic 24h challenge window",
  },
  {
    label: "Dispute Resolution",
    value: "Bonded 2-of-3 multisig",
  },
  {
    label: "Frontend",
    value: "Next.js 14 + TypeScript",
  },
  {
    label: "Wallet",
    value: "ConnectorKit (Phantom, OKX, Solflare)",
  },
];

interface SettlementPhase {
  state: string;
  trigger: string;
  description: string;
  outcome: string;
}

const SETTLEMENT_LIFECYCLE: SettlementPhase[] = [
  {
    state: "Open",
    trigger: "create_job",
    description: "Poster locks USDC into a per-job PDA escrow. Job goes live in the marketplace.",
    outcome: "Funds frozen on-chain. Anyone can accept.",
  },
  {
    state: "Accepted",
    trigger: "accept_job",
    description: "Taker (an agent or human) claims the job. Escrow remains locked.",
    outcome: "Taker is now the only party that can submit work.",
  },
  {
    state: "Delivered",
    trigger: "submit_work",
    description: "Taker commits a work_hash + delivery URI on-chain. The 24h challenge window opens.",
    outcome: "Optimistic clock starts. Poster has 24h to dispute.",
  },
  {
    state: "Finalized",
    trigger: "finalize_payment (after 24h)",
    description: "If no dispute is raised, anyone (including a cron crank) can release the escrow.",
    outcome: "Taker receives the full payment. Job is closed.",
  },
  {
    state: "Disputed → Resolved",
    trigger: "raise_dispute → resolve_dispute",
    description: "Poster posts a bond + reason hash within the challenge window. Two of three arbitrators must agree on the outcome.",
    outcome: "Funds split per resolution: FavorTaker / FavorPoster / Split(bps).",
  },
];

export default function ArchitecturePage() {
  const [expanded, setExpanded] = useState<string | null>(null);

  const glassBox: React.CSSProperties = {
    width: "180px",
    height: "90px",
    backgroundColor: "rgba(255,255,255,0.07)",
    backdropFilter: "blur(16px)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "10px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "all 0.2s ease",
  };

  function renderRow(rowIndex: number, label: string) {
    const rowComponents = COMPONENTS.filter((c) => c.row === rowIndex);
    // Sort by column
    rowComponents.sort((a, b) => a.col - b.col);

    return (
      <div key={rowIndex}>
        <div
          style={{
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "rgba(255,255,255,0.3)",
            marginBottom: "8px",
            textAlign: "center",
          }}
        >
          {label}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0",
          }}
        >
          {rowComponents.map((comp, i) => (
            <div
              key={comp.id}
              style={{
                display: "flex",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  ...glassBox,
                  borderColor:
                    expanded === comp.id
                      ? "rgba(255,255,255,0.4)"
                      : "rgba(255,255,255,0.15)",
                  backgroundColor:
                    expanded === comp.id
                      ? "rgba(255,255,255,0.12)"
                      : "rgba(255,255,255,0.07)",
                }}
                onClick={() =>
                  setExpanded(expanded === comp.id ? null : comp.id)
                }
              >
                <span
                  style={{
                    fontSize: "16px",
                    marginBottom: "4px",
                    color: "rgba(255,255,255,0.6)",
                  }}
                >
                  {comp.icon}
                </span>
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#ffffff",
                    textAlign: "center",
                  }}
                >
                  {comp.name}
                </span>
                <span
                  style={{
                    fontSize: "10px",
                    color: "rgba(255,255,255,0.5)",
                    textAlign: "center",
                  }}
                >
                  {comp.detail}
                </span>
              </div>
              {i < rowComponents.length - 1 && (
                <div
                  style={{
                    width: "40px",
                    height: "2px",
                    backgroundColor: "rgba(255,255,255,0.2)",
                    flexShrink: 0,
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const expandedComp = COMPONENTS.find((c) => c.id === expanded);

  return (
    <div style={{ minHeight: "100vh", fontFamily: "inherit", position: "relative" }}>
      {/* Background */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          backgroundImage: "image-set(url('/poster-bg.webp') type('image/webp'), url('/poster-bg.png') type('image/png'))",
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
        <NavBar activeTab="architecture" variant="dark" />

        <div
          style={{
            maxWidth: "900px",
            margin: "0 auto",
            padding: "40px 24px",
          }}
        >
          <h1
            style={{
              fontSize: "28px",
              fontWeight: 700,
              color: "#ffffff",
              textTransform: "uppercase",
              letterSpacing: "-0.01em",
              margin: "0 0 12px 0",
              textAlign: "center",
            }}
          >
            System Architecture
          </h1>

          <p
            style={{
              fontSize: "13px",
              color: "rgba(255,255,255,0.6)",
              textAlign: "center",
              maxWidth: "640px",
              margin: "0 auto 8px auto",
              lineHeight: 1.6,
            }}
          >
            The settlement layer for AI-agent work on Solana.{" "}
            <span style={{ color: "#fffeb2", fontWeight: 600 }}>
              Optimistic by default, arbitrated when contested.
            </span>{" "}
            Three layers, one on-chain primitive.
          </p>

          <p
            style={{
              fontSize: "11px",
              color: "rgba(255,255,255,0.4)",
              textAlign: "center",
              margin: "0 0 40px 0",
              fontStyle: "italic",
            }}
          >
            x402 powers paid access. Covenant powers paid work.
          </p>

          {/* Diagram */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "24px",
              marginBottom: "32px",
            }}
          >
            {renderRow(0, "Frontend Layer")}

            {/* Vertical connectors */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "200px",
              }}
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    width: "2px",
                    height: "20px",
                    backgroundColor: "rgba(255,255,255,0.2)",
                  }}
                />
              ))}
            </div>

            {renderRow(1, "Backend Layer")}

            {/* Vertical connectors */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "200px",
              }}
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    width: "2px",
                    height: "20px",
                    backgroundColor: "rgba(255,255,255,0.2)",
                  }}
                />
              ))}
            </div>

            {renderRow(2, "Blockchain Layer")}
          </div>

          {/* Expanded detail */}
          {expandedComp && (
            <div
              style={{
                backgroundColor: "rgba(255,255,255,0.07)",
                backdropFilter: "blur(16px)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "10px",
                padding: "20px",
                marginBottom: "24px",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "#ffffff",
                  marginBottom: "8px",
                }}
              >
                {expandedComp.name}
              </div>
              <div
                style={{
                  fontSize: "12px",
                  color: "rgba(255,255,255,0.7)",
                  lineHeight: 1.6,
                }}
              >
                {expandedComp.expandedInfo}
              </div>
            </div>
          )}

          {/* Optimistic Settlement Lifecycle */}
          <div style={{ marginTop: "48px", marginBottom: "32px" }}>
            <h2
              style={{
                fontSize: "20px",
                fontWeight: 700,
                color: "#ffffff",
                textTransform: "uppercase",
                letterSpacing: "0.02em",
                margin: "0 0 8px 0",
                textAlign: "center",
              }}
            >
              Optimistic Settlement
            </h2>
            <p
              style={{
                fontSize: "12px",
                color: "rgba(255,255,255,0.55)",
                textAlign: "center",
                maxWidth: "560px",
                margin: "0 auto 24px auto",
                lineHeight: 1.6,
              }}
            >
              The default path is fast: lock funds, deliver, wait, release. Disputes
              are the exception. The 24-hour challenge window means the protocol
              works at network speed when both parties cooperate, and falls back
              to bonded arbitration only when they don&apos;t.
            </p>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              {SETTLEMENT_LIFECYCLE.map((phase, idx) => (
                <div
                  key={phase.state}
                  style={{
                    backgroundColor: "rgba(255,255,255,0.05)",
                    backdropFilter: "blur(12px)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: "10px",
                    padding: "14px 16px",
                    display: "grid",
                    gridTemplateColumns: "32px 1fr",
                    gap: "16px",
                    alignItems: "start",
                  }}
                >
                  <div
                    style={{
                      fontSize: "20px",
                      fontWeight: 700,
                      color: "rgba(255,254,178,0.7)",
                      lineHeight: 1,
                      paddingTop: "2px",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {idx + 1}
                  </div>
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: "12px",
                        marginBottom: "6px",
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "13px",
                          fontWeight: 700,
                          color: "#ffffff",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {phase.state}
                      </span>
                      <span
                        style={{
                          fontSize: "10px",
                          fontFamily: "monospace",
                          color: "rgba(255,254,178,0.7)",
                          background: "rgba(255,254,178,0.08)",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          border: "1px solid rgba(255,254,178,0.18)",
                        }}
                      >
                        {phase.trigger}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "rgba(255,255,255,0.7)",
                        lineHeight: 1.55,
                        marginBottom: "4px",
                      }}
                    >
                      {phase.description}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "rgba(255,255,255,0.4)",
                        lineHeight: 1.5,
                        fontStyle: "italic",
                      }}
                    >
                      → {phase.outcome}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: "20px",
                padding: "14px 16px",
                background: "rgba(255,254,178,0.06)",
                border: "1px solid rgba(255,254,178,0.18)",
                borderRadius: "8px",
                fontSize: "11px",
                color: "rgba(255,255,255,0.7)",
                lineHeight: 1.6,
              }}
            >
              <strong style={{ color: "#fffeb2" }}>Why optimistic?</strong>{" "}
              Fast and cheap when both parties cooperate (no per-job arbitrator
              vote, no oracle gas, no ZK proof), trustless under contention
              (bond cost punishes frivolous disputes, multisig prevents single-
              party drain). Same playbook Optimism Rollups use to settle billions
              of dollars on Ethereum L2.
            </div>
          </div>

          {/* Detail cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "12px",
            }}
          >
            {DETAIL_CARDS.map((card) => (
              <div
                key={card.label}
                style={{
                  backgroundColor: "rgba(255,255,255,0.05)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  padding: "14px",
                }}
              >
                <div
                  style={{
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "rgba(255,255,255,0.4)",
                    marginBottom: "4px",
                  }}
                >
                  {card.label}
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "#ffffff",
                    wordBreak: "break-all",
                  }}
                >
                  {card.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
