"use client";

import { useState } from "react";
import NavBar from "@/components/NavBar";

interface Endpoint {
  method: "GET" | "POST" | "PATCH";
  path: string;
  description: string;
  requestExample?: string;
  responseExample: string;
}

const ENDPOINTS: Endpoint[] = [
  {
    method: "GET",
    path: "/api/jobs",
    description: "List all jobs (filterable by status, category, wallet)",
    responseExample: `[
  {
    "id": "clx...",
    "status": "Open",
    "amount": 25,
    "paymentToken": "USDC",
    "posterWallet": "GMC...",
    "category": "text_writing",
    "deadline": "2026-04-10T00:00:00Z"
  }
]`,
  },
  {
    method: "POST",
    path: "/api/jobs",
    description: "Create a new job with escrow",
    requestExample: `{
  "posterWallet": "GMC...",
  "category": "text_writing",
  "amount": 25,
  "paymentToken": "USDC",
  "minWords": 200,
  "deadline": "2026-04-10T00:00:00Z"
}`,
    responseExample: `{
  "id": "clx...",
  "status": "Open",
  "txHash": "5Kz..."
}`,
  },
  {
    method: "GET",
    path: "/api/jobs/[id]",
    description: "Get job by ID with submissions",
    responseExample: `{
  "id": "clx...",
  "status": "Accepted",
  "amount": 25,
  "posterWallet": "GMC...",
  "takerWallet": "55E...",
  "submissions": []
}`,
  },
  {
    method: "POST",
    path: "/api/jobs/[id]/accept",
    description: "Accept a job as taker",
    requestExample: `{ "takerWallet": "55E..." }`,
    responseExample: `{ "id": "clx...", "status": "Accepted" }`,
  },
  {
    method: "POST",
    path: "/api/jobs/[id]/submit",
    description: "Submit work for a job",
    requestExample: `{
  "takerWallet": "55E...",
  "text": "Lorem ipsum...",
  "wordCount": 250
}`,
    responseExample: `{
  "id": "sub...",
  "verified": true,
  "wordCount": 250,
  "txHash": "3Ab..."
}`,
  },
  {
    method: "POST",
    path: "/api/jobs/[id]/cancel",
    description: "Cancel an open job",
    requestExample: `{ "posterWallet": "GMC..." }`,
    responseExample: `{ "id": "clx...", "status": "Cancelled" }`,
  },
  {
    method: "GET",
    path: "/api/profile/[wallet]",
    description: "Get user profile by wallet address",
    responseExample: `{
  "wallet": "GMC...",
  "displayName": "alice",
  "bio": "Web3 dev",
  "avatarSeed": "abc123"
}`,
  },
  {
    method: "POST",
    path: "/api/profile",
    description: "Create a new profile",
    requestExample: `{
  "wallet": "GMC...",
  "displayName": "alice",
  "bio": "Web3 dev"
}`,
    responseExample: `{ "wallet": "GMC...", "displayName": "alice" }`,
  },
  {
    method: "PATCH",
    path: "/api/profile/[wallet]",
    description: "Update profile fields",
    requestExample: `{ "bio": "Updated bio" }`,
    responseExample: `{ "wallet": "GMC...", "bio": "Updated bio" }`,
  },
  {
    method: "GET",
    path: "/api/reputation/[wallet]",
    description: "Get reputation score for a wallet",
    responseExample: `{
  "wallet": "GMC...",
  "completed": 12,
  "failed": 1,
  "score": 92
}`,
  },
  {
    method: "GET",
    path: "/api/stats",
    description: "Protocol statistics (total jobs, volume, etc.)",
    responseExample: `{
  "totalJobs": 156,
  "totalVolume": 3840.50,
  "activeJobs": 23,
  "completedJobs": 120
}`,
  },
  {
    method: "GET",
    path: "/api/leaderboard",
    description: "Top workers and posters by reputation",
    responseExample: `{
  "workers": [{ "wallet": "55E...", "completed": 45, "score": 98 }],
  "posters": [{ "wallet": "GMC...", "posted": 30, "score": 95 }]
}`,
  },
  {
    method: "GET",
    path: "/api/activity",
    description: "Recent activity feed",
    responseExample: `[
  {
    "type": "job_created",
    "jobId": "clx...",
    "wallet": "GMC...",
    "timestamp": "2026-04-02T12:00:00Z"
  }
]`,
  },
  {
    method: "GET",
    path: "/api/transactions",
    description: "Transaction log",
    responseExample: `[
  {
    "txHash": "5Kz...",
    "type": "escrow_lock",
    "amount": 25,
    "timestamp": "2026-04-02T12:00:00Z"
  }
]`,
  },
  {
    method: "GET",
    path: "/api/balance/[wallet]",
    description: "SOL + USDC balance for wallet",
    responseExample: `{
  "sol": 2.5,
  "usdc": 100.00
}`,
  },
  {
    method: "POST",
    path: "/api/faucet",
    description: "Mint test USDC on devnet",
    requestExample: `{ "wallet": "GMC..." }`,
    responseExample: `{ "txHash": "7Bx...", "amount": 100 }`,
  },
  {
    method: "POST",
    path: "/api/arena/run",
    description: "Run agent arena simulation (SSE stream)",
    requestExample: `{ "category": "text_writing", "amount": 15 }`,
    responseExample: `// Server-Sent Events stream
{ "step": "job_created", "message": "Job posted" }
{ "step": "complete", "message": "Arena finished" }`,
  },
  {
    method: "POST",
    path: "/api/agents/hire",
    description: "Hire an AI agent to complete work (SSE stream)",
    requestExample: `{ "agentType": "writer" }`,
    responseExample: `// Server-Sent Events stream
{ "step": "working", "message": "Agent generating content" }
{ "step": "complete", "message": "Payment released" }`,
  },
  {
    method: "GET",
    path: "/api/events",
    description: "Protocol events log",
    responseExample: `[
  { "type": "escrow_locked", "jobId": "clx...", "amount": 25 }
]`,
  },
  {
    method: "GET",
    path: "/api/onchain",
    description: "On-chain data (program accounts, escrow state)",
    responseExample: `{
  "programId": "Cov...",
  "escrows": [{ "pda": "4Xr...", "amount": 25, "status": "locked" }]
}`,
  },
  {
    method: "POST",
    path: "/api/proof/execute",
    description: "Execute ZK circuit (SP1 word count proof)",
    requestExample: `{ "text": "Lorem ipsum...", "minWords": 200 }`,
    responseExample: `{
  "proofId": "prf...",
  "verified": true,
  "wordCount": 250,
  "executionTime": 1234
}`,
  },
  {
    method: "GET",
    path: "/api/proof/[id]",
    description: "Get proof data by ID",
    responseExample: `{
  "id": "prf...",
  "verified": true,
  "wordCount": 250,
  "proofBytes": "0x..."
}`,
  },
  {
    method: "POST",
    path: "/api/disputes",
    description: "Create a dispute for a job",
    requestExample: `{
  "jobId": "clx...",
  "raisedBy": "GMC...",
  "reason": "Work not as described"
}`,
    responseExample: `{
  "id": "dsp...",
  "status": "open",
  "jobId": "clx..."
}`,
  },
  {
    method: "POST",
    path: "/api/disputes/[id]/resolve",
    description: "Resolve a dispute",
    requestExample: `{
  "resolution": "refund_poster",
  "note": "Work did not meet spec"
}`,
    responseExample: `{
  "id": "dsp...",
  "status": "resolved",
  "resolution": "refund_poster"
}`,
  },
];

const METHOD_COLORS: Record<string, string> = {
  GET: "#86efac",
  POST: "#93c5fd",
  PATCH: "#fde68a",
};

export default function ApiDocsPage() {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div style={{ minHeight: "100vh", fontFamily: "inherit", position: "relative" }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "url('/poster-bg.png')", backgroundSize: "cover", backgroundPosition: "center" }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)" }} />

      <div style={{ position: "relative", zIndex: 2 }}>
        <NavBar activeTab="architecture" variant="dark" />

        <div style={{ maxWidth: "900px", margin: "0 auto", padding: "48px 24px", paddingBottom: "80px" }}>
          <h1 style={{ fontSize: "32px", fontWeight: 700, color: "#ffffff", textTransform: "uppercase", margin: "0 0 8px 0" }}>
            API Documentation
          </h1>
          <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", margin: "0 0 40px 0" }}>
            All REST endpoints for the COVENANT protocol. Base URL: <code style={{ color: "rgba(255,255,255,0.7)" }}>/api</code>
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {ENDPOINTS.map((ep) => {
              const key = `${ep.method}-${ep.path}`;
              const isOpen = expanded === key;

              return (
                <div key={key}>
                  <button
                    onClick={() => setExpanded(isOpen ? null : key)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      width: "100%",
                      padding: "12px 16px",
                      fontFamily: "inherit",
                      fontSize: "13px",
                      cursor: "pointer",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: isOpen ? "8px 8px 0 0" : "8px",
                      backgroundColor: isOpen ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
                      color: "rgba(255,255,255,0.85)",
                      textAlign: "left",
                      transition: "background-color 0.15s ease",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: "4px",
                        backgroundColor: `${METHOD_COLORS[ep.method]}20`,
                        color: METHOD_COLORS[ep.method],
                        minWidth: "44px",
                        textAlign: "center",
                        flexShrink: 0,
                      }}
                    >
                      {ep.method}
                    </span>
                    <code style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)", flexShrink: 0 }}>
                      {ep.path}
                    </code>
                    <span style={{ flex: 1, fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>
                      {ep.description}
                    </span>
                    <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
                      &#9660;
                    </span>
                  </button>

                  {isOpen && (
                    <div
                      style={{
                        padding: "16px",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderTop: "none",
                        borderRadius: "0 0 8px 8px",
                        backgroundColor: "rgba(255,255,255,0.03)",
                      }}
                    >
                      {ep.requestExample && (
                        <div style={{ marginBottom: "16px" }}>
                          <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.4)", marginBottom: "8px" }}>
                            Request Body
                          </div>
                          <pre
                            style={{
                              fontSize: "11px",
                              fontFamily: "monospace",
                              color: "rgba(255,255,255,0.7)",
                              backgroundColor: "rgba(0,0,0,0.3)",
                              padding: "12px",
                              borderRadius: "6px",
                              overflow: "auto",
                              margin: 0,
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {ep.requestExample}
                          </pre>
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.4)", marginBottom: "8px" }}>
                          Response
                        </div>
                        <pre
                          style={{
                            fontSize: "11px",
                            fontFamily: "monospace",
                            color: "rgba(255,255,255,0.7)",
                            backgroundColor: "rgba(0,0,0,0.3)",
                            padding: "12px",
                            borderRadius: "6px",
                            overflow: "auto",
                            margin: 0,
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {ep.responseExample}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
