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
    expandedInfo: "Anchor framework smart contract deployed at HAptQVTwT4AYRzPkvT9UFxGEZEjqVs6ALF295WXXPTNo. Manages escrow creation, acceptance, submission verification, and fund release.",
  },
  {
    id: "zkvm",
    icon: "**",
    name: "SP1 zkVM",
    detail: "237K cycles",
    row: 2,
    col: 2,
    expandedInfo: "Succinct SP1 zkVM circuit for word-count verification. Proves text meets minimum word count without revealing content. 237,583 cycles for typical verification.",
  },
];

const DETAIL_CARDS = [
  {
    label: "Program ID",
    value: "HAptQVTwT4AYRzPkvT9UFxGEZEjqVs6ALF295WXXPTNo",
  },
  {
    label: "Database",
    value: "Neon PostgreSQL (5 tables)",
  },
  {
    label: "ZK Circuit",
    value: "SP1 word-count (237K cycles)",
  },
  {
    label: "Frontend",
    value: "Next.js 14 + TypeScript + Tailwind",
  },
  {
    label: "Wallet",
    value: "ConnectorKit (Phantom, Solflare)",
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
              margin: "0 0 40px 0",
              textAlign: "center",
            }}
          >
            System Architecture
          </h1>

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
