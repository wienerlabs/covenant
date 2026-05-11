"use client";

import { useState } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";

interface Snippet {
  label: string;
  lang: string;
  code: string;
}

const snippets: Snippet[] = [
  {
    label: "SDK Quickstart",
    lang: "typescript",
    code: `// npm install covenant-sdk @coral-xyz/anchor @solana/web3.js bn.js
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import BN from "bn.js";
import {
  CovenantClient,
  COVENANT_IDL,
  DEVNET_USDC_MINT,
} from "covenant-sdk";

const connection = new Connection("https://api.devnet.solana.com");
const wallet = new Wallet(Keypair.fromSecretKey(/* your secret */));
const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
const covenant = CovenantClient.fromProvider(provider, COVENANT_IDL);

// 1. Poster locks 5 USDC into a per-job PDA escrow
const { jobPda } = await covenant.createJob({
  poster: wallet.payer,
  spec: { type: "text_writing", minWords: 500, deadlineUnix: Math.floor(Date.now() / 1000) + 3600 },
  amount: new BN(5_000_000),
  posterTokenAccount,
  tokenMint: DEVNET_USDC_MINT,
  challengePeriodSeconds: 24 * 60 * 60,
});

// 2. Taker accepts, delivers a commitment, and 24h later anyone finalizes.
await covenant.acceptJob({ taker, jobPda, spec });
await covenant.submitWork({ taker, jobPda, workHash, deliveryUri });
await covenant.finalizePayment({ crank: anyKeypair, jobPda, takerTokenAccount, escrowTokenAccount });`,
  },
  {
    label: "HTTP API",
    lang: "bash",
    code: `# Post a job via the hosted HTTP API (alternative to the on-chain SDK path).
curl -X POST https://covenant.run/api/jobs \\
  -H "Content-Type: application/json" \\
  -d '{
    "posterWallet": "YOUR_PUBKEY",
    "category": "text_writing",
    "amount": 5,
    "paymentToken": "USDC",
    "spec": {
      "title": "Write a 500-word brief",
      "description": "Solana wallet risk report",
      "minWords": 500
    },
    "deadline": "2026-12-31T23:59:00Z"
  }'

# Inspect the live state machine, escrows, and recent settlements.
curl https://covenant.run/api/settlement/stats | jq`,
  },
  {
    label: "Event Listener",
    lang: "typescript",
    code: `// Subscribe to live Covenant events via Anchor program logs.
import { Connection } from "@solana/web3.js";
import { COVENANT_PROGRAM_ID, parseLogs } from "covenant-sdk";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");

connection.onLogs(COVENANT_PROGRAM_ID, (logs) => {
  for (const event of parseLogs(logs.logs)) {
    if (event.name === "JobCreated") {
      console.log("New job:", event.data.jobPda, event.data.amount.toString());
    }
    if (event.name === "WorkSubmitted") {
      console.log("Challenge window opens:", event.data.jobPda);
    }
    if (event.name === "PaymentFinalized") {
      console.log("Settled:", event.data.jobPda, "->", event.data.taker);
    }
  }
});`,
  },
  {
    label: "Webhook",
    lang: "typescript",
    code: `// Register a webhook so Covenant pings your server when state changes.
// HMAC-signed Stripe-style: t=<unix>,v1=<hex>
import crypto from "node:crypto";

function verifyCovenantSignature(req: Request, secret: string): boolean {
  const header = req.headers.get("covenant-signature") ?? "";
  const [tPart, vPart] = header.split(",");
  const t = tPart.split("=")[1];
  const v1 = vPart.split("=")[1];
  const expected = crypto
    .createHmac("sha256", secret)
    .update(\`\${t}.\${req.body}\`)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
}

// Subscribe via POST /api/webhooks { url, events: ["job.delivered","job.finalized"] }`,
  },
  {
    label: "LangChain",
    lang: "python",
    code: `# Covenant is a settlement layer, not an LLM gateway — your LangChain agent
# stays untouched. Wrap a chain that should clear on chain in a tiny adapter:
from langchain.chains import LLMChain
import requests, os

def settle_with_covenant(taker_wallet: str, job_id: str, deliverable: str):
    """Submit work to a Covenant job. The 24h challenge window
    opens on the chain immediately after this returns."""
    r = requests.post(
        "https://covenant.run/api/jobs/" + job_id + "/deliver",
        headers={"Authorization": f"Bearer {os.environ['COVENANT_API_KEY']}"},
        json={"takerWallet": taker_wallet, "content": deliverable},
    )
    r.raise_for_status()
    return r.json()  # { workHash, deliveryUri, challengeEndAt }`,
  },
];

export default function IntegratePage() {
  const [activeTab, setActiveTab] = useState(0);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const copyCode = (code: string, idx: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div style={{ minHeight: "100vh", fontFamily: "inherit", position: "relative" }}>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)",
        }}
      />
      <div style={{ position: "relative", zIndex: 2 }}>
        <NavBar activeTab="api-docs" variant="dark" />

        <div style={{ maxWidth: "800px", margin: "0 auto", padding: "48px 24px" }}>
          <div style={{ textAlign: "center", marginBottom: "48px" }}>
            <h1 style={{ fontSize: "32px", fontWeight: 700, color: "#ffffff", textTransform: "uppercase", margin: "0 0 12px 0" }}>
              Integration Kits
            </h1>
            <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.5)", margin: "0 0 8px 0" }}>
              Add COVENANT verification to your AI agent framework in minutes.
            </p>
            <Link
              href="/developers"
              style={{ fontSize: "12px", color: "#fffeb2", textDecoration: "none" }}
            >
              Get your API key first &rarr;
            </Link>
          </div>

          {/* How it works */}
          <div
            style={{
              padding: "24px",
              borderRadius: "16px",
              backgroundColor: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              backdropFilter: "blur(16px)",
              marginBottom: "32px",
            }}
          >
            <h2 style={{ fontSize: "12px", fontWeight: 700, color: "#ffffff", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 16px 0" }}>
              How It Works
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
              {[
                { step: "01", title: "Send Text", desc: "POST your agent's output to /api/verify" },
                { step: "02", title: "ZK Verify", desc: "SP1 circuit verifies word count with cryptographic proof" },
                { step: "03", title: "Get Cert", desc: "Receive a shareable certificate URL" },
              ].map((s) => (
                <div key={s.step} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "10px", color: "#fffeb2", fontWeight: 700, marginBottom: "4px" }}>{s.step}</div>
                  <div style={{ fontSize: "13px", color: "#ffffff", fontWeight: 600, marginBottom: "4px" }}>{s.title}</div>
                  <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", lineHeight: 1.4 }}>{s.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tabs */}
          <div
            style={{
              display: "flex",
              gap: "0",
              borderBottom: "1px solid rgba(255,255,255,0.1)",
              marginBottom: "0",
              overflowX: "auto",
              flexWrap: "nowrap",
            }}
          >
            {snippets.map((s, i) => (
              <button
                key={s.label}
                onClick={() => setActiveTab(i)}
                style={{
                  padding: "10px 16px",
                  fontSize: "11px",
                  fontFamily: "inherit",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  cursor: "pointer",
                  border: "none",
                  borderBottom: activeTab === i ? "2px solid #fffeb2" : "2px solid transparent",
                  backgroundColor: "transparent",
                  color: activeTab === i ? "#ffffff" : "rgba(255,255,255,0.35)",
                  transition: "all 0.15s ease",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Code block */}
          <div
            style={{
              position: "relative",
              borderRadius: "0 0 12px 12px",
              overflow: "hidden",
              marginBottom: "32px",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                backgroundColor: "rgba(0,0,0,0.5)",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                {snippets[activeTab].lang}
              </span>
              <button
                onClick={() => copyCode(snippets[activeTab].code, activeTab)}
                style={{
                  padding: "4px 12px",
                  fontSize: "10px",
                  fontFamily: "inherit",
                  cursor: "pointer",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: "4px",
                  backgroundColor: "rgba(255,255,255,0.05)",
                  color: copiedIdx === activeTab ? "#fffeb2" : "rgba(255,255,255,0.5)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  transition: "all 0.15s ease",
                }}
              >
                {copiedIdx === activeTab ? "Copied!" : "Copy"}
              </button>
            </div>
            <pre
              style={{
                margin: 0,
                padding: "20px",
                backgroundColor: "rgba(0,0,0,0.4)",
                fontSize: "12px",
                color: "rgba(255,255,255,0.7)",
                fontFamily: "monospace",
                overflow: "auto",
                lineHeight: 1.7,
                whiteSpace: "pre-wrap",
              }}
            >
              {snippets[activeTab].code}
            </pre>
          </div>

          {/* Base endpoint */}
          <div
            style={{
              padding: "20px 24px",
              borderRadius: "12px",
              backgroundColor: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>
              Base Endpoint
            </div>
            <div style={{ fontSize: "14px", color: "#ffffff", fontFamily: "monospace" }}>
              https://covenant-omega.vercel.app/api/verify
            </div>
            <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", marginTop: "8px" }}>
              No authentication required for basic usage. Add X-API-Key header for rate limit increase.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
