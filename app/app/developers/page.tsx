"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useConnector } from "@solana/connector/react";
import NavBar from "@/components/NavBar";

interface ApiKeyData {
  id: string;
  key: string;
  name: string;
  calls: number;
  limit: number;
  active: boolean;
  createdAt: string;
}

export default function DevelopersPage() {
  const { isConnected, account } = useConnector();
  const [keys, setKeys] = useState<ApiKeyData[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [keyName, setKeyName] = useState("Default");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/keys?wallet=${account}`);
      const data = await res.json();
      if (data.keys) setKeys(data.keys);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    if (isConnected && account) {
      fetchKeys();
    }
  }, [isConnected, account, fetchKeys]);

  const createKey = async () => {
    if (!account) return;
    setCreating(true);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: account, name: keyName }),
      });
      const data = await res.json();
      if (data.key) {
        setKeys([data, ...keys]);
        setKeyName("Default");
      }
    } catch {
      // silently fail
    } finally {
      setCreating(false);
    }
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const codeSnippets = [
    {
      label: "cURL",
      lang: "bash",
      code: `curl -X POST https://covenant-omega.vercel.app/api/verify \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: cvn_your_key" \\
  -d '{"text": "your text here", "minWords": 100}'`,
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
      label: "Python",
      lang: "python",
      code: `import requests

response = requests.post(
    "https://covenant-omega.vercel.app/api/verify",
    headers={"X-API-Key": "cvn_your_key"},
    json={"text": agent_output, "minWords": 100}
)
data = response.json()
print(f"Verified: {data['verified']}")
print(f"Certificate: https://covenant-omega.vercel.app/certificate/{data['certificateId']}")`,
    },
  ];

  const [activeSnippet, setActiveSnippet] = useState(0);

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
              Developers
            </h1>
            <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.5)", margin: "0 0 8px 0" }}>
              Get your API key and start verifying AI agent output programmatically.
            </p>
            <Link
              href="/integrate"
              style={{
                fontSize: "12px",
                color: "#42BDFF",
                textDecoration: "none",
              }}
            >
              View integration kits &rarr;
            </Link>
          </div>

          {/* API Key Section */}
          <div
            style={{
              padding: "28px",
              borderRadius: "16px",
              backgroundColor: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              backdropFilter: "blur(16px)",
              marginBottom: "32px",
            }}
          >
            <h2 style={{ fontSize: "14px", fontWeight: 700, color: "#ffffff", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 20px 0" }}>
              Get Your API Key
            </h2>

            {!isConnected ? (
              <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", padding: "20px 0", textAlign: "center" }}>
                Connect your wallet to generate an API key
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: "12px", marginBottom: "20px" }}>
                  <input
                    type="text"
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    placeholder="Key name"
                    style={{
                      flex: 1,
                      padding: "10px 14px",
                      fontSize: "13px",
                      fontFamily: "inherit",
                      color: "#ffffff",
                      backgroundColor: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: "8px",
                      outline: "none",
                    }}
                  />
                  <button
                    onClick={createKey}
                    disabled={creating}
                    style={{
                      padding: "10px 24px",
                      fontSize: "12px",
                      fontFamily: "inherit",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      cursor: creating ? "wait" : "pointer",
                      border: "1px solid #42BDFF",
                      borderRadius: "8px",
                      backgroundColor: "#42BDFF",
                      color: "#ffffff",
                      transition: "all 0.2s ease",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {creating ? "..." : "Generate Key"}
                  </button>
                </div>

                {loading ? (
                  <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>Loading keys...</div>
                ) : keys.length === 0 ? (
                  <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "16px 0" }}>
                    No API keys yet. Generate one above.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {keys.map((k) => (
                      <div
                        key={k.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "12px 16px",
                          borderRadius: "8px",
                          backgroundColor: "rgba(255,255,255,0.03)",
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>{k.name}</div>
                          <div style={{ fontSize: "12px", color: "#ffffff", fontFamily: "monospace" }}>
                            {k.key.slice(0, 12)}...{k.key.slice(-4)}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)" }}>
                            {k.calls}/{k.limit} calls
                          </span>
                          <button
                            onClick={() => copyKey(k.key)}
                            style={{
                              padding: "4px 10px",
                              fontSize: "10px",
                              fontFamily: "inherit",
                              cursor: "pointer",
                              border: "1px solid rgba(255,255,255,0.15)",
                              borderRadius: "4px",
                              backgroundColor: "rgba(255,255,255,0.05)",
                              color: copiedKey === k.key ? "#FFE342" : "rgba(255,255,255,0.5)",
                              transition: "all 0.15s ease",
                            }}
                          >
                            {copiedKey === k.key ? "Copied!" : "Copy"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* API Documentation */}
          <div
            style={{
              padding: "28px",
              borderRadius: "16px",
              backgroundColor: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              backdropFilter: "blur(16px)",
              marginBottom: "32px",
            }}
          >
            <h2 style={{ fontSize: "14px", fontWeight: 700, color: "#ffffff", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 20px 0" }}>
              API Reference
            </h2>

            <div style={{ marginBottom: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "4px", backgroundColor: "rgba(59,130,246,0.2)", color: "#42BDFF", fontWeight: 600 }}>
                  POST
                </span>
                <span style={{ fontSize: "13px", color: "#ffffff", fontFamily: "monospace" }}>/api/verify</span>
              </div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginBottom: "12px" }}>
                Verify text and get a certificate.
              </div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", marginBottom: "4px" }}>Request body:</div>
              <pre style={{ margin: 0, padding: "12px", borderRadius: "8px", backgroundColor: "rgba(0,0,0,0.3)", fontSize: "11px", color: "rgba(255,255,255,0.6)", fontFamily: "monospace", overflow: "auto" }}>
{`{
  "text": "string (required)",
  "minWords": "number (default: 100)"
}`}
              </pre>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", marginTop: "12px", marginBottom: "4px" }}>Response:</div>
              <pre style={{ margin: 0, padding: "12px", borderRadius: "8px", backgroundColor: "rgba(0,0,0,0.3)", fontSize: "11px", color: "rgba(255,255,255,0.6)", fontFamily: "monospace", overflow: "auto" }}>
{`{
  "certificateId": "string",
  "verified": "boolean",
  "wordCount": "number",
  "textHash": "string (SHA-256)",
  "cycleCount": 237583
}`}
              </pre>
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "4px", backgroundColor: "rgba(34,197,94,0.2)", color: "#22c55e", fontWeight: 600 }}>
                  GET
                </span>
                <span style={{ fontSize: "13px", color: "#ffffff", fontFamily: "monospace" }}>/api/certificate/[id]</span>
              </div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>
                Fetch certificate data by ID.
              </div>
            </div>
          </div>

          {/* Code Snippets */}
          <div
            style={{
              padding: "28px",
              borderRadius: "16px",
              backgroundColor: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              backdropFilter: "blur(16px)",
            }}
          >
            <h2 style={{ fontSize: "14px", fontWeight: 700, color: "#ffffff", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 20px 0" }}>
              Quick Start
            </h2>

            {/* Tabs */}
            <div style={{ display: "flex", gap: "0", marginBottom: "16px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
              {codeSnippets.map((s, i) => (
                <button
                  key={s.label}
                  onClick={() => setActiveSnippet(i)}
                  style={{
                    padding: "8px 16px",
                    fontSize: "11px",
                    fontFamily: "inherit",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    cursor: "pointer",
                    border: "none",
                    borderBottom: activeSnippet === i ? "2px solid #42BDFF" : "2px solid transparent",
                    backgroundColor: "transparent",
                    color: activeSnippet === i ? "#ffffff" : "rgba(255,255,255,0.4)",
                    transition: "all 0.15s ease",
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div style={{ position: "relative" }}>
              <pre
                style={{
                  margin: 0,
                  padding: "16px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(0,0,0,0.4)",
                  fontSize: "11px",
                  color: "rgba(255,255,255,0.7)",
                  fontFamily: "monospace",
                  overflow: "auto",
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}
              >
                {codeSnippets[activeSnippet].code}
              </pre>
              <button
                onClick={() => navigator.clipboard.writeText(codeSnippets[activeSnippet].code)}
                style={{
                  position: "absolute",
                  top: "8px",
                  right: "8px",
                  padding: "4px 10px",
                  fontSize: "9px",
                  fontFamily: "inherit",
                  cursor: "pointer",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: "4px",
                  backgroundColor: "rgba(0,0,0,0.5)",
                  color: "rgba(255,255,255,0.5)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
