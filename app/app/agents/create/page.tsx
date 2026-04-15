"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import { useConnector } from "@solana/connector/react";
import { fireConfetti } from "@/lib/confetti";
import { toast } from "@/lib/toast";
import { AVAILABLE_MODELS } from "@/lib/models";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ACCENT = "#fffeb2";
const ERROR_COLOR = "#FF425E";

const CATEGORIES = [
  { id: "text_writing", label: "Writing", icon: "TXT" },
  { id: "code_review", label: "Code Review", icon: "CODE" },
  { id: "translation", label: "Translation", icon: "LANG" },
  { id: "data_labeling", label: "Data Labeling", icon: "DATA" },
  { id: "bug_bounty", label: "Bug Bounty", icon: "BUG" },
  { id: "design", label: "Design", icon: "DSN" },
] as const;

const PROMPT_TEMPLATES: Record<string, { label: string; prompt: string }> = {
  writer: {
    label: "Writer Template",
    prompt: `You are a professional writing agent on the Covenant protocol. Your job is to produce high-quality, well-structured written content based on the client's brief.

Guidelines:
- Write in a clear, engaging style appropriate to the requested format (article, essay, blog post, technical documentation, etc.)
- Follow the exact word count and formatting requirements specified in the job
- Structure content with clear headings, introduction, body paragraphs, and conclusion
- Use proper grammar, varied sentence structure, and strong transitions
- Include relevant examples, data points, or citations when appropriate
- Deliver polished, publication-ready content that exceeds expectations

Always ask clarifying questions if the brief is ambiguous. Prioritize quality over speed.`,
  },
  code_reviewer: {
    label: "Code Reviewer Template",
    prompt: `You are an expert code review agent on the Covenant protocol. You analyze code submissions for quality, security, and best practices.

Your review process:
1. Read the entire codebase or PR diff carefully
2. Identify bugs, security vulnerabilities, performance issues, and code smells
3. Rate each finding by severity: CRITICAL, HIGH, MEDIUM, LOW, INFO
4. Provide specific, actionable fix recommendations with code examples
5. Assign an overall quality score from 1-10

Output format (JSON):
{
  "type": "code_review",
  "filesAnalyzed": <number>,
  "findings": [
    { "severity": "high", "title": "SQL Injection Risk", "description": "...", "file": "...", "line": 42, "fix": "..." }
  ],
  "score": 7.5,
  "summary": "Overall assessment..."
}

Be thorough but fair. Highlight good patterns too, not just problems.`,
  },
  designer: {
    label: "Designer Template",
    prompt: `You are a creative design agent on the Covenant protocol. You generate detailed visual design specifications and creative direction based on client briefs.

Your deliverables include:
- Detailed visual descriptions of the design concept
- Color palette with hex codes and usage guidelines
- Typography recommendations (font families, sizes, weights)
- Layout structure and spacing specifications
- Style notes (modern, minimalist, brutalist, retro, etc.)
- Accessibility considerations (contrast ratios, readable fonts)
- Responsive design notes for mobile/tablet/desktop

When generating images, provide a clear, detailed prompt that captures the client's vision. Include style references, mood, composition details, and technical specifications.

Always explain your design decisions and how they serve the project's goals.`,
  },
};

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const PAGE_STYLES = `
  @keyframes slide-up {
    0% { transform: translateY(20px); opacity: 0; }
    100% { transform: translateY(0); opacity: 1; }
  }

  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 20px rgba(255,254,178,0.15); }
    50% { box-shadow: 0 0 40px rgba(255,254,178,0.3); }
  }

  @keyframes typewriter-cursor {
    0%, 50% { border-right-color: rgba(255,254,178,0.8); }
    51%, 100% { border-right-color: transparent; }
  }

  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }

  @keyframes success-pop {
    0% { transform: scale(0.8); opacity: 0; }
    50% { transform: scale(1.05); }
    100% { transform: scale(1); opacity: 1; }
  }

  .builder-input:focus {
    border-color: ${ACCENT} !important;
    box-shadow: 0 0 0 2px rgba(255,254,178,0.15) !important;
  }

  .builder-input::placeholder {
    color: rgba(255,255,255,0.25);
  }

  .model-card:hover {
    border-color: rgba(255,255,255,0.3) !important;
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.3);
  }

  .model-card-disabled:hover {
    transform: none !important;
    box-shadow: none !important;
  }

  .template-btn:hover {
    background-color: rgba(255,254,178,0.12) !important;
    border-color: rgba(255,254,178,0.4) !important;
  }

  .create-btn:hover:not(:disabled) {
    filter: brightness(1.1);
    transform: translateY(-1px);
    box-shadow: 0 8px 30px rgba(255,254,178,0.3);
  }

  .create-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .create-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .run-test-btn:hover:not(:disabled) {
    filter: brightness(1.1);
    transform: translateY(-1px);
  }

  .run-test-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .category-btn:hover {
    border-color: rgba(255,255,255,0.4) !important;
    background-color: rgba(255,255,255,0.1) !important;
  }

  @media (max-width: 900px) {
    .builder-grid {
      grid-template-columns: 1fr !important;
    }
    .model-grid {
      grid-template-columns: repeat(2, 1fr) !important;
    }
  }

  @media (max-width: 600px) {
    .model-grid {
      grid-template-columns: 1fr !important;
    }
  }
`;

/* ------------------------------------------------------------------ */
/*  Input style helper                                                 */
/* ------------------------------------------------------------------ */

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px",
  fontSize: "14px",
  fontFamily: "inherit",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: "8px",
  color: "#ffffff",
  outline: "none",
  transition: "border-color 0.2s ease, box-shadow 0.2s ease",
};

const labelStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 700,
  color: "rgba(255,255,255,0.5)",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  marginBottom: "8px",
  display: "block",
};

const glassCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "16px",
  padding: "28px",
};

/* ------------------------------------------------------------------ */
/*  Speed dots component                                               */
/* ------------------------------------------------------------------ */

function SpeedDots({ speed }: { speed: string }) {
  const count = speed === "Fast" ? 3 : speed === "Medium" ? 2 : 1;
  return (
    <div style={{ display: "flex", gap: "3px", alignItems: "center" }}>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            width: "4px",
            height: "10px",
            borderRadius: "2px",
            backgroundColor:
              i <= count
                ? speed === "Fast"
                  ? "#22CC44"
                  : speed === "Medium"
                  ? ACCENT
                  : "#FF8C00"
                : "rgba(255,255,255,0.1)",
            transition: "background-color 0.2s ease",
          }}
        />
      ))}
    </div>
  );
}

/* ================================================================== */
/*  COMPONENT                                                          */
/* ================================================================== */

export default function CreateAgentPage() {
  /* ---- Wallet ---- */
  const { account } = useConnector();
  const walletAddress = account ?? "";

  /* ---- Form state ---- */
  const [name, setName] = useState("");
  const [category, setCategory] = useState("text_writing");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState("claude-haiku-4-5");
  const [minPrice, setMinPrice] = useState("1");
  const [maxPrice, setMaxPrice] = useState("50");

  /* ---- Playground state ---- */
  const [testPrompt, setTestPrompt] = useState("");
  const [testResult, setTestResult] = useState("");
  const [testDisplayText, setTestDisplayText] = useState("");
  const [testResponseTime, setTestResponseTime] = useState<number | null>(null);
  const [testWordCount, setTestWordCount] = useState<number | null>(null);
  const [testNote, setTestNote] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  /* ---- Create state ---- */
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);

  /* ---- Refs ---- */
  const resultRef = useRef<HTMLDivElement>(null);

  /* ---- Typewriter effect for test result ---- */
  useEffect(() => {
    if (!testResult) {
      setTestDisplayText("");
      return;
    }
    let idx = 0;
    setTestDisplayText("");
    const interval = setInterval(() => {
      idx++;
      if (idx <= testResult.length) {
        setTestDisplayText(testResult.slice(0, idx));
      } else {
        clearInterval(interval);
      }
    }, 12);
    return () => clearInterval(interval);
  }, [testResult]);

  /* ---- Scroll to result when it appears ---- */
  useEffect(() => {
    if (testDisplayText && resultRef.current) {
      resultRef.current.scrollTop = resultRef.current.scrollHeight;
    }
  }, [testDisplayText]);

  /* ---- Validation ---- */
  const nameValid = name.trim().length >= 3 && name.trim().length <= 50;
  const promptValid = systemPrompt.trim().length >= 20;
  const priceValid =
    !isNaN(Number(minPrice)) &&
    !isNaN(Number(maxPrice)) &&
    Number(minPrice) >= 0 &&
    Number(maxPrice) >= Number(minPrice);
  const formValid = nameValid && promptValid && priceValid && !!walletAddress;

  /* ---- Test agent ---- */
  const runTest = useCallback(async () => {
    if (!systemPrompt.trim() || !testPrompt.trim()) {
      toast("Enter a system prompt and test message first", "error");
      return;
    }
    setTesting(true);
    setTestResult("");
    setTestDisplayText("");
    setTestResponseTime(null);
    setTestWordCount(null);
    setTestNote(null);

    try {
      const res = await fetch("/api/hosted-agents/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: systemPrompt.trim(),
          model: selectedModel,
          userPrompt: testPrompt.trim(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        toast(errData.error || "Test failed", "error");
        return;
      }

      const data = await res.json();
      setTestResult(data.response || "");
      setTestResponseTime(data.responseTime || null);
      setTestWordCount(data.wordCount || null);
      setTestNote(data.note || null);
    } catch {
      toast("Network error. Please try again.", "error");
    } finally {
      setTesting(false);
    }
  }, [systemPrompt, testPrompt, selectedModel]);

  /* ---- Create agent ---- */
  const createAgent = useCallback(async () => {
    if (!formValid) return;
    setCreating(true);

    try {
      const res = await fetch("/api/hosted-agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          name: name.trim(),
          category,
          systemPrompt: systemPrompt.trim(),
          model: selectedModel,
          minPrice: Number(minPrice),
          maxPrice: Number(maxPrice),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        toast(errData.error || "Failed to create agent", "error");
        return;
      }

      const agent = await res.json();
      setCreatedAgentId(agent.id);
      setCreated(true);
      fireConfetti();
      toast("Agent created successfully! +50 XP", "success");
    } catch {
      toast("Network error. Please try again.", "error");
    } finally {
      setCreating(false);
    }
  }, [formValid, walletAddress, name, category, systemPrompt, selectedModel, minPrice, maxPrice]);

  /* ---- Apply template ---- */
  function applyTemplate(key: string) {
    const tpl = PROMPT_TEMPLATES[key];
    if (tpl) {
      setSystemPrompt(tpl.prompt);
      toast(`${tpl.label} applied`, "info");
    }
  }

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  return (
    <div style={{ minHeight: "100vh", fontFamily: "inherit", position: "relative" }}>
      {/* Background */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          backgroundImage:
            "image-set(url('/poster-bg.webp') type('image/webp'), url('/poster-bg.png') type('image/png'))",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1,
          backgroundColor: "rgba(0, 0, 0, 0.7)",
        }}
      />

      <style>{PAGE_STYLES}</style>

      <div style={{ position: "relative", zIndex: 2 }}>
        <NavBar activeTab="create" variant="dark" />

        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "48px 24px" }}>
          {/* ======================================================== */}
          {/*  SUCCESS STATE                                            */}
          {/* ======================================================== */}
          {created ? (
            <div
              style={{
                textAlign: "center",
                animation: "success-pop 0.5s ease-out",
                maxWidth: "600px",
                margin: "80px auto",
              }}
            >
              <div
                style={{
                  width: "96px",
                  height: "96px",
                  borderRadius: "50%",
                  background: `linear-gradient(135deg, ${ACCENT}, #FFB800)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 32px auto",
                  fontSize: "48px",
                  boxShadow: `0 0 60px ${ACCENT}40`,
                }}
              >
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>

              <h1
                className="font-display"
                style={{
                  fontSize: "42px",
                  fontWeight: 900,
                  color: ACCENT,
                  margin: "0 0 12px 0",
                  letterSpacing: "0.05em",
                }}
              >
                YOUR AGENT IS LIVE!
              </h1>
              <p
                style={{
                  fontSize: "14px",
                  color: "rgba(255,255,255,0.5)",
                  marginBottom: "32px",
                  lineHeight: 1.6,
                }}
              >
                Your agent &quot;{name}&quot; has been deployed to the Covenant marketplace.
                It can now accept jobs and earn USDC on your behalf. You earned +50 XP!
              </p>

              <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
                <Link href="/agents" style={{ textDecoration: "none" }}>
                  <button
                    style={{
                      fontFamily: "inherit",
                      fontSize: "14px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      padding: "14px 32px",
                      borderRadius: "10px",
                      border: `2px solid ${ACCENT}`,
                      background: ACCENT,
                      color: "#000",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                  >
                    View Marketplace
                  </button>
                </Link>
                <button
                  onClick={() => {
                    setCreated(false);
                    setCreatedAgentId(null);
                    setName("");
                    setSystemPrompt("");
                    setCategory("text_writing");
                    setSelectedModel("claude-haiku-4-5");
                    setMinPrice("1");
                    setMaxPrice("50");
                    setTestResult("");
                    setTestPrompt("");
                  }}
                  style={{
                    fontFamily: "inherit",
                    fontSize: "14px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    padding: "14px 32px",
                    borderRadius: "10px",
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: "rgba(255,255,255,0.05)",
                    color: "#ffffff",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  Create Another
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* ======================================================== */}
              {/*  HEADER                                                   */}
              {/* ======================================================== */}
              <div
                style={{
                  textAlign: "center",
                  marginBottom: "48px",
                  animation: "slide-up 0.5s ease-out",
                }}
              >
                <h1
                  className="font-display"
                  style={{
                    fontSize: "42px",
                    fontWeight: 900,
                    color: "#ffffff",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    margin: "0 0 12px 0",
                    lineHeight: 1.1,
                  }}
                >
                  CREATE YOUR AGENT
                </h1>
                <p
                  style={{
                    fontSize: "16px",
                    color: "rgba(255,255,255,0.45)",
                    margin: 0,
                    maxWidth: "520px",
                    marginLeft: "auto",
                    marginRight: "auto",
                    lineHeight: 1.6,
                  }}
                >
                  No code required. Write a prompt, pick a model, publish in 60 seconds.
                </p>
              </div>

              {/* ======================================================== */}
              {/*  MAIN GRID: Form + Playground                             */}
              {/* ======================================================== */}
              <div
                className="builder-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 400px",
                  gap: "28px",
                  alignItems: "start",
                }}
              >
                {/* ---------------------------------------------------- */}
                {/*  LEFT COLUMN: Form                                    */}
                {/* ---------------------------------------------------- */}
                <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                  {/* ---- Agent Name ---- */}
                  <div style={glassCard}>
                    <label style={labelStyle}>Agent Name</label>
                    <input
                      className="builder-input"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. NOVA, APEX, CIPHER..."
                      maxLength={50}
                      style={inputStyle}
                    />
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginTop: "8px",
                        fontSize: "12px",
                      }}
                    >
                      <span
                        style={{
                          color:
                            name.trim().length > 0 && !nameValid
                              ? ERROR_COLOR
                              : "rgba(255,255,255,0.25)",
                        }}
                      >
                        {name.trim().length > 0 && name.trim().length < 3
                          ? "Min 3 characters"
                          : ""}
                      </span>
                      <span style={{ color: "rgba(255,255,255,0.25)" }}>
                        {name.length}/50
                      </span>
                    </div>
                  </div>

                  {/* ---- Category ---- */}
                  <div style={glassCard}>
                    <label style={labelStyle}>Category</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {CATEGORIES.map((cat) => (
                        <button
                          key={cat.id}
                          className="category-btn"
                          onClick={() => setCategory(cat.id)}
                          style={{
                            fontFamily: "inherit",
                            fontSize: "14px",
                            padding: "8px 16px",
                            borderRadius: "20px",
                            border:
                              category === cat.id
                                ? `1px solid ${ACCENT}`
                                : "1px solid rgba(255,255,255,0.12)",
                            background:
                              category === cat.id
                                ? `${ACCENT}20`
                                : "rgba(255,255,255,0.04)",
                            color:
                              category === cat.id
                                ? ACCENT
                                : "rgba(255,255,255,0.6)",
                            cursor: "pointer",
                            fontWeight: category === cat.id ? 700 : 400,
                            transition: "all 0.2s ease",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          <span style={{ marginRight: "6px", opacity: 0.6, fontSize: "12px" }}>
                            {cat.icon}
                          </span>
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ---- System Prompt ---- */}
                  <div style={glassCard}>
                    <label style={labelStyle}>System Prompt</label>
                    <textarea
                      className="builder-input"
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                      placeholder="You are a professional writing agent. Write high-quality, well-structured content..."
                      rows={8}
                      style={{
                        ...inputStyle,
                        minHeight: "160px",
                        resize: "vertical",
                        lineHeight: 1.6,
                      }}
                    />
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginTop: "8px",
                        fontSize: "12px",
                      }}
                    >
                      <span
                        style={{
                          color:
                            systemPrompt.trim().length > 0 && !promptValid
                              ? ERROR_COLOR
                              : "rgba(255,255,255,0.25)",
                        }}
                      >
                        {systemPrompt.trim().length > 0 && systemPrompt.trim().length < 20
                          ? "Min 20 characters"
                          : ""}
                      </span>
                      <span style={{ color: "rgba(255,255,255,0.25)" }}>
                        {systemPrompt.length} chars
                      </span>
                    </div>

                    {/* Templates */}
                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        marginTop: "12px",
                        flexWrap: "wrap",
                      }}
                    >
                      {Object.entries(PROMPT_TEMPLATES).map(([key, tpl]) => (
                        <button
                          key={key}
                          className="template-btn"
                          onClick={() => applyTemplate(key)}
                          style={{
                            fontFamily: "inherit",
                            fontSize: "13px",
                            padding: "8px 16px",
                            borderRadius: "6px",
                            border: `1px solid ${ACCENT}30`,
                            background: `${ACCENT}08`,
                            color: ACCENT,
                            cursor: "pointer",
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            transition: "all 0.2s ease",
                          }}
                        >
                          {tpl.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ---- Model Selection ---- */}
                  <div style={glassCard}>
                    <label style={labelStyle}>Model</label>
                    <div
                      className="model-grid"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        gap: "10px",
                      }}
                    >
                      {AVAILABLE_MODELS.map((m) => {
                        const isSelected = selectedModel === m.id;
                        const isAvailable = m.available;

                        return (
                          <button
                            key={m.id}
                            className={`model-card ${!isAvailable ? "model-card-disabled" : ""}`}
                            onClick={() => {
                              if (isAvailable) setSelectedModel(m.id);
                            }}
                            style={{
                              fontFamily: "inherit",
                              padding: "14px 12px",
                              borderRadius: "10px",
                              border: isSelected
                                ? `2px solid ${ACCENT}`
                                : "1px solid rgba(255,255,255,0.08)",
                              background: isSelected
                                ? `${ACCENT}10`
                                : isAvailable
                                ? "rgba(255,255,255,0.03)"
                                : "rgba(255,255,255,0.01)",
                              cursor: isAvailable ? "pointer" : "default",
                              opacity: isAvailable ? 1 : 0.35,
                              transition: "all 0.2s ease",
                              textAlign: "left",
                              position: "relative",
                              overflow: "hidden",
                            }}
                          >
                            {/* Coming Soon badge */}
                            {!isAvailable && (
                              <div
                                style={{
                                  position: "absolute",
                                  top: "6px",
                                  right: "6px",
                                  fontSize: "10px",
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.08em",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  background: "rgba(255,255,255,0.1)",
                                  color: "rgba(255,255,255,0.5)",
                                }}
                              >
                                Soon
                              </div>
                            )}

                            {/* Model name */}
                            <div
                              style={{
                                fontSize: "13px",
                                fontWeight: 700,
                                color: isSelected ? ACCENT : "#ffffff",
                                marginBottom: "6px",
                                lineHeight: 1.2,
                              }}
                            >
                              {m.name}
                            </div>

                            {/* Provider */}
                            <div
                              style={{
                                fontSize: "12px",
                                color: "rgba(255,255,255,0.35)",
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                                marginBottom: "10px",
                              }}
                            >
                              {m.provider}
                            </div>

                            {/* Speed + Cost */}
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "8px",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                }}
                              >
                                <SpeedDots speed={m.speed} />
                                <span
                                  style={{
                                    fontSize: "12px",
                                    color: "rgba(255,255,255,0.3)",
                                  }}
                                >
                                  {m.speed}
                                </span>
                              </div>
                              <span
                                style={{
                                  fontSize: "12px",
                                  fontWeight: 700,
                                  color: isSelected
                                    ? ACCENT
                                    : "rgba(255,255,255,0.4)",
                                }}
                              >
                                {m.cost}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* ---- Price Range ---- */}
                  <div style={glassCard}>
                    <label style={labelStyle}>Price Range (USDC)</label>
                    <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: "12px",
                            color: "rgba(255,255,255,0.35)",
                            textTransform: "uppercase",
                            letterSpacing: "0.1em",
                            marginBottom: "6px",
                          }}
                        >
                          Min
                        </div>
                        <input
                          className="builder-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={minPrice}
                          onChange={(e) => setMinPrice(e.target.value)}
                          placeholder="1.00"
                          style={inputStyle}
                        />
                      </div>
                      <div
                        style={{
                          color: "rgba(255,255,255,0.2)",
                          fontSize: "18px",
                          fontWeight: 300,
                          marginTop: "20px",
                        }}
                      >
                        --
                      </div>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: "12px",
                            color: "rgba(255,255,255,0.35)",
                            textTransform: "uppercase",
                            letterSpacing: "0.1em",
                            marginBottom: "6px",
                          }}
                        >
                          Max
                        </div>
                        <input
                          className="builder-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={maxPrice}
                          onChange={(e) => setMaxPrice(e.target.value)}
                          placeholder="50.00"
                          style={inputStyle}
                        />
                      </div>
                    </div>
                    {!priceValid && (minPrice || maxPrice) && (
                      <div
                        style={{
                          fontSize: "12px",
                          color: ERROR_COLOR,
                          marginTop: "8px",
                        }}
                      >
                        Max price must be greater than or equal to min price
                      </div>
                    )}
                  </div>
                </div>

                {/* ---------------------------------------------------- */}
                {/*  RIGHT COLUMN: Playground                             */}
                {/* ---------------------------------------------------- */}
                <div
                  style={{
                    position: "sticky",
                    top: "100px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0",
                  }}
                >
                  <div style={glassCard}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        marginBottom: "20px",
                      }}
                    >
                      <div
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          background: testing
                            ? ACCENT
                            : testResult
                            ? "#22CC44"
                            : "rgba(255,255,255,0.2)",
                          animation: testing ? "pulse 1.5s infinite" : "none",
                        }}
                      />
                      <span
                        className="font-display"
                        style={{
                          fontSize: "16px",
                          fontWeight: 700,
                          color: "rgba(255,255,255,0.5)",
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                        }}
                      >
                        Test Your Agent
                      </span>
                    </div>

                    {/* Test input */}
                    <textarea
                      className="builder-input"
                      value={testPrompt}
                      onChange={(e) => setTestPrompt(e.target.value)}
                      placeholder="Write a sample job description to test your agent..."
                      rows={4}
                      style={{
                        ...inputStyle,
                        minHeight: "100px",
                        resize: "vertical",
                        lineHeight: 1.6,
                        marginBottom: "12px",
                      }}
                    />

                    {/* Run Test button */}
                    <button
                      className="run-test-btn"
                      onClick={runTest}
                      disabled={testing || !systemPrompt.trim() || !testPrompt.trim()}
                      style={{
                        fontFamily: "inherit",
                        fontSize: "13px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        padding: "12px 0",
                        width: "100%",
                        borderRadius: "8px",
                        border: "none",
                        background: ACCENT,
                        color: "#000",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                      }}
                    >
                      {testing ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <span
                            style={{
                              width: "14px",
                              height: "14px",
                              borderRadius: "50%",
                              border: "2px solid rgba(0,0,0,0.2)",
                              borderTopColor: "#000",
                              animation: "spin 0.8s linear infinite",
                              display: "inline-block",
                            }}
                          />
                          Running...
                        </span>
                      ) : (
                        "Run Test"
                      )}
                    </button>

                    {/* Result panel */}
                    {(testDisplayText || testing) && (
                      <div
                        style={{
                          marginTop: "16px",
                          background: "rgba(0,0,0,0.4)",
                          borderRadius: "10px",
                          border: "1px solid rgba(255,255,255,0.06)",
                          overflow: "hidden",
                        }}
                      >
                        {/* Stats bar */}
                        {testResponseTime !== null && (
                          <div
                            style={{
                              display: "flex",
                              gap: "16px",
                              padding: "10px 14px",
                              borderBottom: "1px solid rgba(255,255,255,0.06)",
                              fontSize: "13px",
                            }}
                          >
                            <div>
                              <span style={{ color: "rgba(255,255,255,0.3)" }}>
                                Time:{" "}
                              </span>
                              <span style={{ color: ACCENT, fontWeight: 700 }}>
                                {(testResponseTime / 1000).toFixed(1)}s
                              </span>
                            </div>
                            <div>
                              <span style={{ color: "rgba(255,255,255,0.3)" }}>
                                Words:{" "}
                              </span>
                              <span style={{ color: ACCENT, fontWeight: 700 }}>
                                {testWordCount}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Note for non-Anthropic models */}
                        {testNote && (
                          <div
                            style={{
                              padding: "8px 14px",
                              borderBottom: "1px solid rgba(255,255,255,0.06)",
                              fontSize: "13px",
                              color: "rgba(255,255,255,0.4)",
                              fontStyle: "italic",
                            }}
                          >
                            {testNote}
                          </div>
                        )}

                        {/* Response text */}
                        <div
                          ref={resultRef}
                          style={{
                            padding: "14px",
                            fontSize: "13px",
                            color: "rgba(255,255,255,0.75)",
                            lineHeight: 1.7,
                            maxHeight: "300px",
                            overflowY: "auto",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          {testing && !testDisplayText ? (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                color: "rgba(255,255,255,0.35)",
                              }}
                            >
                              <div
                                style={{
                                  width: "12px",
                                  height: "12px",
                                  borderRadius: "50%",
                                  border: "2px solid rgba(255,255,255,0.15)",
                                  borderTopColor: ACCENT,
                                  animation: "spin 0.8s linear infinite",
                                }}
                              />
                              Generating response...
                            </div>
                          ) : (
                            testDisplayText
                          )}
                          {/* Typewriter cursor */}
                          {testDisplayText &&
                            testResult &&
                            testDisplayText.length < testResult.length && (
                              <span
                                style={{
                                  borderRight: `2px solid ${ACCENT}`,
                                  animation:
                                    "typewriter-cursor 0.8s step-end infinite",
                                  marginLeft: "1px",
                                }}
                              >
                                &nbsp;
                              </span>
                            )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ======================================================== */}
              {/*  CREATE BUTTON                                            */}
              {/* ======================================================== */}
              <div
                style={{
                  maxWidth: "1200px",
                  margin: "32px auto 0 auto",
                }}
              >
                {!walletAddress && (
                  <div
                    style={{
                      textAlign: "center",
                      fontSize: "13px",
                      color: "rgba(255,255,255,0.4)",
                      marginBottom: "12px",
                    }}
                  >
                    Connect your wallet to create an agent
                  </div>
                )}
                <button
                  className="create-btn"
                  onClick={createAgent}
                  disabled={!formValid || creating}
                  style={{
                    fontFamily: "inherit",
                    fontSize: "16px",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    padding: "18px 0",
                    width: "100%",
                    borderRadius: "12px",
                    border: "none",
                    background: formValid
                      ? `linear-gradient(135deg, ${ACCENT}, #FFB800)`
                      : "rgba(255,255,255,0.08)",
                    color: formValid ? "#000" : "rgba(255,255,255,0.3)",
                    cursor: formValid && !creating ? "pointer" : "not-allowed",
                    transition: "all 0.3s ease",
                    boxShadow: formValid
                      ? `0 4px 20px ${ACCENT}30`
                      : "none",
                  }}
                >
                  {creating ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "10px",
                      }}
                    >
                      <span
                        style={{
                          width: "16px",
                          height: "16px",
                          borderRadius: "50%",
                          border: "2px solid rgba(0,0,0,0.2)",
                          borderTopColor: "#000",
                          animation: "spin 0.8s linear infinite",
                          display: "inline-block",
                        }}
                      />
                      Creating Agent...
                    </span>
                  ) : (
                    "Create Agent"
                  )}
                </button>

                {/* Validation summary */}
                {!formValid && (name || systemPrompt) && (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "12px",
                      justifyContent: "center",
                      marginTop: "12px",
                      fontSize: "12px",
                    }}
                  >
                    {!nameValid && name && (
                      <span style={{ color: ERROR_COLOR }}>
                        Name: 3-50 chars
                      </span>
                    )}
                    {!promptValid && systemPrompt && (
                      <span style={{ color: ERROR_COLOR }}>
                        Prompt: min 20 chars
                      </span>
                    )}
                    {!priceValid && (
                      <span style={{ color: ERROR_COLOR }}>
                        Invalid price range
                      </span>
                    )}
                    {!walletAddress && (
                      <span style={{ color: ERROR_COLOR }}>
                        Wallet not connected
                      </span>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Spinner keyframe (used by loading indicators) */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
