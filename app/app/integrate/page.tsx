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
    label: "LangChain",
    lang: "python",
    code: `from covenant import verify_work

result = verify_work(
    text=agent_output,
    min_words=100,
    api_key="cvn_your_key"
)
if result.verified:
    print(f"Verified! Certificate: {result.certificate_url}")`,
  },
  {
    label: "JavaScript",
    lang: "javascript",
    code: `const response = await fetch('https://covenant-omega.vercel.app/api/verify', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'cvn_your_key'
  },
  body: JSON.stringify({ text: agentOutput, minWords: 100 })
});
const { verified, certificateId } = await response.json();
console.log(\`Certificate: https://covenant-omega.vercel.app/certificate/\${certificateId}\`);`,
  },
  {
    label: "CrewAI",
    lang: "python",
    code: `from crewai import Agent, Task
from covenant import CovenantVerifier

verifier = CovenantVerifier(api_key="cvn_your_key")
task = Task(
    description="Write a 500-word article",
    agent=writer_agent,
    callback=lambda output: verifier.verify(output, min_words=500)
)`,
  },
  {
    label: "cURL",
    lang: "bash",
    code: `curl -X POST https://covenant-omega.vercel.app/api/verify \\
  -H "Content-Type: application/json" \\
  -d '{"text":"Hello world this is a test of the COVENANT verification system...", "minWords": 10}'`,
  },
  {
    label: "Python",
    lang: "python",
    code: `import requests

def verify_with_covenant(text: str, min_words: int = 100, api_key: str = None):
    """Verify AI agent output with COVENANT ZK proofs."""
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["X-API-Key"] = api_key

    response = requests.post(
        "https://covenant-omega.vercel.app/api/verify",
        headers=headers,
        json={"text": text, "minWords": min_words}
    )
    data = response.json()

    if data.get("verified"):
        cert_url = f"https://covenant-omega.vercel.app/certificate/{data['certificateId']}"
        print(f"Verified! Certificate: {cert_url}")
        return data
    else:
        print(f"Not verified. Word count: {data.get('wordCount', 0)}")
        return data

# Usage
result = verify_with_covenant(agent_output, min_words=200)`,
  },
  {
    label: "AutoGen",
    lang: "python",
    code: `from autogen import AssistantAgent, UserProxyAgent
import requests

class CovenantAgent(AssistantAgent):
    """An AutoGen agent that verifies its output via COVENANT."""

    def verify_output(self, text: str, min_words: int = 100):
        response = requests.post(
            "https://covenant-omega.vercel.app/api/verify",
            json={"text": text, "minWords": min_words}
        )
        return response.json()

    def generate_reply(self, messages, sender, config):
        reply = super().generate_reply(messages, sender, config)
        if reply:
            verification = self.verify_output(reply)
            if verification.get("verified"):
                reply += f"\\n\\n[Verified by COVENANT - Certificate: {verification['certificateId']}]"
        return reply`,
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
              style={{ fontSize: "12px", color: "#3B82F6", textDecoration: "none" }}
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
                  <div style={{ fontSize: "10px", color: "#3B82F6", fontWeight: 700, marginBottom: "4px" }}>{s.step}</div>
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
                  borderBottom: activeTab === i ? "2px solid #3B82F6" : "2px solid transparent",
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
                  color: copiedIdx === activeTab ? "#86efac" : "rgba(255,255,255,0.5)",
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
