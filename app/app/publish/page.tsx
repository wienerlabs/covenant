"use client";

import { useState, useCallback } from "react";
import { useConnector } from "@solana/connector/react";
import NavBar from "@/components/NavBar";

interface Capability {
  id: string;
  description: string;
  price: string;
}

export default function PublishPage() {
  const { isConnected, account } = useConnector();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [agentType, setAgentType] = useState("Task");
  const [capabilities, setCapabilities] = useState<Capability[]>([
    { id: "", description: "", price: "" },
  ]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");

  const addCapability = () => {
    setCapabilities([...capabilities, { id: "", description: "", price: "" }]);
  };

  const updateCapability = (index: number, field: keyof Capability, value: string) => {
    const updated = [...capabilities];
    updated[index] = { ...updated[index], [field]: value };
    setCapabilities(updated);
  };

  const removeCapability = (index: number) => {
    if (capabilities.length <= 1) return;
    setCapabilities(capabilities.filter((_, i) => i !== index));
  };

  const handleSubmit = useCallback(async () => {
    if (!account || !name || !endpointUrl) return;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/agents/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: account,
          name,
          description,
          endpointUrl,
          type: agentType,
          capabilities: capabilities.filter((c) => c.id),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Registration failed");
      } else {
        setResult(data);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [account, name, description, endpointUrl, agentType, capabilities]);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    fontSize: "13px",
    fontFamily: "inherit",
    color: "#ffffff",
    backgroundColor: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "8px",
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "10px",
    color: "rgba(255,255,255,0.5)",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    marginBottom: "6px",
    display: "block",
  };

  // Preview agent card
  const previewCard = {
    "@context": "https://schema.org",
    "@type": "SoftwareAgent",
    name: name || "Your Agent Name",
    description: description || "...",
    url: endpointUrl || "https://...",
    agentType,
    capabilities: capabilities.filter((c) => c.id).map((c) => ({
      id: c.id,
      description: c.description,
      price: c.price,
    })),
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
        <NavBar activeTab="agents" variant="dark" />

        <div style={{ maxWidth: "800px", margin: "0 auto", padding: "48px 24px" }}>
          <div style={{ textAlign: "center", marginBottom: "40px" }}>
            <h1
              style={{
                fontSize: "32px",
                fontWeight: 700,
                color: "#ffffff",
                textTransform: "uppercase",
                margin: "0 0 12px 0",
              }}
            >
              Publish Your Agent
            </h1>
            <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.5)", margin: 0 }}>
              Register your AI agent on COVENANT. Let others hire it for verified work.
            </p>
          </div>

          {!isConnected ? (
            <div
              style={{
                textAlign: "center",
                padding: "48px",
                borderRadius: "16px",
                backgroundColor: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <div style={{ fontSize: "16px", color: "rgba(255,255,255,0.6)", marginBottom: "12px" }}>
                Connect your wallet to publish an agent
              </div>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)" }}>
                Use the wallet button in the top-right corner
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px" }}>
              {/* Left: Form */}
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <div>
                  <label style={labelStyle}>Agent Name *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My AI Writer"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What does your agent do?"
                    rows={3}
                    style={{ ...inputStyle, resize: "vertical" }}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Endpoint URL *</label>
                  <input
                    type="url"
                    value={endpointUrl}
                    onChange={(e) => setEndpointUrl(e.target.value)}
                    placeholder="https://my-agent.example.com/api"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Agent Type</label>
                  <div style={{ display: "flex", gap: "12px" }}>
                    {["LLM", "Task", "Execution"].map((t) => (
                      <label
                        key={t}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          cursor: "pointer",
                          padding: "8px 14px",
                          borderRadius: "6px",
                          border: `1px solid ${agentType === t ? "#3B82F6" : "rgba(255,255,255,0.15)"}`,
                          backgroundColor: agentType === t ? "rgba(59,130,246,0.15)" : "transparent",
                          fontSize: "12px",
                          color: agentType === t ? "#3B82F6" : "rgba(255,255,255,0.5)",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <input
                          type="radio"
                          name="agentType"
                          value={t}
                          checked={agentType === t}
                          onChange={() => setAgentType(t)}
                          style={{ display: "none" }}
                        />
                        {t}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Capabilities</label>
                  {capabilities.map((cap, i) => (
                    <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                      <input
                        type="text"
                        value={cap.id}
                        onChange={(e) => updateCapability(i, "id", e.target.value)}
                        placeholder="Capability ID"
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <input
                        type="text"
                        value={cap.description}
                        onChange={(e) => updateCapability(i, "description", e.target.value)}
                        placeholder="Description"
                        style={{ ...inputStyle, flex: 2 }}
                      />
                      <input
                        type="text"
                        value={cap.price}
                        onChange={(e) => updateCapability(i, "price", e.target.value)}
                        placeholder="Price"
                        style={{ ...inputStyle, width: "80px", flex: "none" }}
                      />
                      {capabilities.length > 1 && (
                        <button
                          onClick={() => removeCapability(i)}
                          style={{
                            padding: "0 10px",
                            fontSize: "16px",
                            color: "rgba(255,255,255,0.3)",
                            backgroundColor: "transparent",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          x
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={addCapability}
                    style={{
                      padding: "6px 14px",
                      fontSize: "11px",
                      fontFamily: "inherit",
                      color: "rgba(255,255,255,0.5)",
                      backgroundColor: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "6px",
                      cursor: "pointer",
                    }}
                  >
                    + Add Capability
                  </button>
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={loading || !name || !endpointUrl}
                  style={{
                    padding: "14px 24px",
                    fontSize: "14px",
                    fontFamily: "inherit",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    cursor: loading || !name || !endpointUrl ? "not-allowed" : "pointer",
                    border: "1px solid #3B82F6",
                    borderRadius: "8px",
                    backgroundColor: loading ? "rgba(59,130,246,0.2)" : "#3B82F6",
                    color: loading ? "#3B82F6" : "#ffffff",
                    transition: "all 0.2s ease",
                    opacity: !name || !endpointUrl ? 0.4 : 1,
                  }}
                >
                  {loading ? "Publishing..." : "Publish Agent"}
                </button>

                {error && (
                  <div style={{ fontSize: "12px", color: "#fca5a5", padding: "12px", borderRadius: "8px", backgroundColor: "rgba(239,68,68,0.1)" }}>
                    {error}
                  </div>
                )}

                {result && (
                  <div style={{ fontSize: "12px", color: "#86efac", padding: "12px", borderRadius: "8px", backgroundColor: "rgba(134,239,172,0.1)" }}>
                    Agent published successfully! DID: {(result as { did?: string }).did}
                  </div>
                )}
              </div>

              {/* Right: Preview */}
              <div>
                <label style={labelStyle}>Agent Card Preview</label>
                <div
                  style={{
                    padding: "20px",
                    borderRadius: "12px",
                    backgroundColor: "rgba(0,0,0,0.4)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    backdropFilter: "blur(12px)",
                  }}
                >
                  <pre
                    style={{
                      margin: 0,
                      fontSize: "10px",
                      color: "rgba(255,255,255,0.6)",
                      fontFamily: "monospace",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                      lineHeight: 1.6,
                    }}
                  >
                    {JSON.stringify(previewCard, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
