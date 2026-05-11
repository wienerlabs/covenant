"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import PixelAgent from "@/components/PixelAgent";
import { useConnector } from "@solana/connector/react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AgentData {
  id: string;
  name: string;
  category: string;
  model: string;
  systemPrompt: string;
  walletAddress: string;
  avatarSeed: string;
  avatarUrl?: string | null;
  minPrice: number;
  maxPrice: number;
  pricePerPrompt: number;
  totalRevenue: number;
  totalEarned: number;
  jobsCompleted: number;
  webEnabled: boolean;
  onChainTx?: string | null;
  active: boolean;
  createdAt: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  timestamp: Date;
  typing?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatCategory(cat: string): string {
  return cat
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
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
    solana_agent: "#9945FF",
  };
  return map[cat] || "#fffeb2";
}

function formatModel(model: string): string {
  const map: Record<string, string> = {
    "claude-haiku-4-5": "Claude Haiku 4.5",
    "claude-sonnet-4-6": "Claude Sonnet 4.6",
    "claude-opus-4-6": "Claude Opus 4.6",
  };
  return map[model] || model;
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AgentChatPage() {
  const { id } = useParams<{ id: string }>();
  const { account } = useConnector();

  const [agent, setAgent] = useState<AgentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // x402 payment state
  const [paymentRequired, setPaymentRequired] = useState<{
    x402Version: number;
    error?: string;
    accepts: { amount: string; payTo: string; asset: string; network: string }[];
    resource: { url: string; description: string };
  } | null>(null);
  const [pendingMessage, setPendingMessage] = useState("");
  const [pendingAgentMsgId, setPendingAgentMsgId] = useState("");
  const [paying, setPaying] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const walletAddress = account || "";

  /* ---- Fetch agent details ---- */
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/hosted-agents/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Agent not found");
        return r.json();
      })
      .then((data: AgentData) => {
        setAgent(data);
        setError(null);
        // Welcome message
        setMessages([
          {
            id: uid(),
            role: "agent",
            text: `Hello! I'm **${data.name}**, your ${formatCategory(data.category)} agent. How can I help you today?`,
            timestamp: new Date(),
          },
        ]);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  /* ---- Load chat history from DB ---- */
  useEffect(() => {
    if (agent && walletAddress) {
      fetch(`/api/hosted-agents/${id}/chat?wallet=${walletAddress}`)
        .then((r) => r.json())
        .then((msgs: { role: string; content: string; createdAt: string }[]) => {
          if (Array.isArray(msgs) && msgs.length > 0) {
            setMessages(
              msgs.map((m) => ({
                id: uid(),
                role: m.role === "user" ? ("user" as const) : ("agent" as const),
                text: m.content,
                timestamp: new Date(m.createdAt),
              }))
            );
          }
        })
        .catch(() => {
          /* best effort – keep welcome message if fetch fails */
        });
    }
  }, [agent, walletAddress, id]);

  /* ---- Auto-scroll ---- */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ---- Cleanup typing interval on unmount ---- */
  useEffect(() => {
    return () => {
      if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
    };
  }, []);

  /* ---- Typewriter effect ---- */
  const typewriterAppend = useCallback((messageId: string, fullText: string) => {
    let charIndex = 0;
    const speed = 12; // ms per character

    typingIntervalRef.current = setInterval(() => {
      charIndex++;
      if (charIndex >= fullText.length) {
        if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, text: fullText, typing: false } : m
          )
        );
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, text: fullText.slice(0, charIndex) } : m
          )
        );
      }
    }, speed);
  }, []);

  /* ---- Send message (with x402 payment handling) ---- */
  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || sending || !agent) return;

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      text: trimmed,
      timestamp: new Date(),
    };

    const agentMsgId = uid();
    const agentPlaceholder: ChatMessage = {
      id: agentMsgId,
      role: "agent",
      text: "",
      timestamp: new Date(),
      typing: true,
    };

    setMessages((prev) => [...prev, userMsg, agentPlaceholder]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch(`/api/hosted-agents/${agent.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          walletAddress: account || undefined,
        }),
      });

      // x402: Handle 402 Payment Required
      if (res.status === 402) {
        const payReq = await res.json();
        setPendingMessage(trimmed);
        setPendingAgentMsgId(agentMsgId);
        setPaymentRequired(payReq);
        // Remove the typing placeholder — payment UI will appear instead
        setMessages((prev) =>
          prev.map((m) =>
            m.id === agentMsgId
              ? { ...m, text: "", typing: false }
              : m
          ).filter((m) => !(m.id === agentMsgId && m.text === ""))
        );
        setSending(false);
        return;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(errData.error || "Request failed");
      }

      const data = await res.json();
      typewriterAppend(agentMsgId, data.response);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Something went wrong";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === agentMsgId
            ? { ...m, text: `Error: ${errMsg}`, typing: false }
            : m
        )
      );
    } finally {
      setSending(false);
    }
  }, [input, sending, agent, account, typewriterAppend]);

  /* ---- x402 Payment handler ---- */
  const handlePayment = useCallback(async () => {
    if (!agent || !pendingMessage || paying) return;
    setPaying(true);

    try {
      // Build a payment signature for devnet.
      // In production with real x402 client SDK, this would construct
      // a proper USDC SPL transfer transaction and encode it as a
      // PaymentPayload. For devnet, we encode a simplified marker.
      const paymentTxHash = `x402:${Date.now()}:${walletAddress || "anonymous"}`;

      const paymentPayload = {
        x402Version: 2,
        resource: paymentRequired?.resource,
        accepted: paymentRequired?.accepts?.[0] || {},
        payload: {
          transaction: paymentTxHash,
        },
      };
      // Unicode-safe base64 encoding for x402 payment header
      const jsonStr = JSON.stringify(paymentPayload);
      const paymentSig = btoa(unescape(encodeURIComponent(jsonStr)));

      // Retry the chat request with payment signature
      const agentMsgId = uid();
      const agentPlaceholder: ChatMessage = {
        id: agentMsgId,
        role: "agent",
        text: "",
        timestamp: new Date(),
        typing: true,
      };
      setMessages((prev) => [...prev, agentPlaceholder]);

      const res = await fetch(`/api/hosted-agents/${agent.id}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Payment-Signature": paymentSig,
        },
        body: JSON.stringify({
          message: pendingMessage,
          walletAddress: account || undefined,
        }),
      });

      if (res.status === 402) {
        // Payment still not verified — show error
        setMessages((prev) =>
          prev.map((m) =>
            m.id === agentMsgId
              ? { ...m, text: "Payment verification failed. Please try again.", typing: false }
              : m
          )
        );
      } else if (res.ok) {
        const data = await res.json();
        typewriterAppend(agentMsgId, data.response);
      } else {
        const errData = await res.json().catch(() => ({ error: "Request failed" }));
        setMessages((prev) =>
          prev.map((m) =>
            m.id === agentMsgId
              ? { ...m, text: `Error: ${errData.error || "Request failed"}`, typing: false }
              : m
          )
        );
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Payment failed";
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "agent",
          text: `Error: ${errMsg}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setPaying(false);
      setPaymentRequired(null);
      setPendingMessage("");
      setPendingAgentMsgId("");
    }
  }, [agent, pendingMessage, paying, walletAddress, paymentRequired, account, typewriterAppend]);

  /* ---- Handle Enter key ---- */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  /* ---- Render simple markdown (images, bold, code, newlines) ---- */
  // Markdown image regex. We intentionally keep this strict: a line that
  // is *only* an image becomes a block-level <img>; an image embedded
  // mid-paragraph is rendered inline. Both work for the design-agent
  // path which emits one image per response.
  const MD_IMAGE = /!\[([^\]]*)\]\(([^)]+)\)/;

  function renderMarkdown(text: string): React.ReactNode[] {
    const parts: React.ReactNode[] = [];
    const lines = text.split("\n");

    lines.forEach((line, li) => {
      // Block-image line: render the image and skip the rest of the
      // bold/code processing for this line.
      const blockMatch = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (blockMatch) {
        const alt = blockMatch[1];
        const src = blockMatch[2];
        parts.push(
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`img-${li}`}
            src={src}
            alt={alt || "generated image"}
            style={{
              maxWidth: "100%",
              borderRadius: "8px",
              display: "block",
              margin: "8px 0",
              border: "1px solid rgba(255,254,178,0.2)",
            }}
          />
        );
        if (li < lines.length - 1) {
          parts.push(<br key={`br-${li}`} />);
        }
        return;
      }

      // Inline tokens: split by image, bold, code in one pass so an
      // image embedded mid-sentence still renders.
      const tokens = line.split(/(!\[[^\]]*\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g);
      tokens.forEach((token, ti) => {
        const inlineImg = token.match(MD_IMAGE);
        if (inlineImg) {
          parts.push(
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${li}-${ti}-img`}
              src={inlineImg[2]}
              alt={inlineImg[1] || "generated image"}
              style={{
                maxWidth: "320px",
                borderRadius: "6px",
                verticalAlign: "middle",
                margin: "0 4px",
                border: "1px solid rgba(255,254,178,0.2)",
              }}
            />
          );
        } else if (token.startsWith("**") && token.endsWith("**")) {
          parts.push(
            <strong key={`${li}-${ti}`} style={{ color: "#fffeb2" }}>
              {token.slice(2, -2)}
            </strong>
          );
        } else if (token.startsWith("`") && token.endsWith("`")) {
          parts.push(
            <code
              key={`${li}-${ti}`}
              style={{
                backgroundColor: "rgba(255,254,178,0.1)",
                padding: "2px 6px",
                borderRadius: "4px",
                fontSize: "0.9em",
                color: "#fffeb2",
              }}
            >
              {token.slice(1, -1)}
            </code>
          );
        } else {
          parts.push(<span key={`${li}-${ti}`}>{token}</span>);
        }
      });
      if (li < lines.length - 1) {
        parts.push(<br key={`br-${li}`} />);
      }
    });

    return parts;
  }

  /* ---- Token inline cards for agent messages ---- */
  function renderMessageWithTokens(content: string): React.ReactNode {
    // Skip token replacement entirely for messages that contain a
    // markdown image; otherwise a token keyword inside the image URL
    // (e.g. "USDC" in a CDN path) breaks the image render.
    if (MD_IMAGE.test(content)) {
      return <>{renderMarkdown(content)}</>;
    }

    const TOKEN_LOGOS: Record<string, string> = {
      "SOL": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
      "USDC": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
      "USDT": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg",
      "BONK": "https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I",
      "JUP": "https://static.jup.ag/jup/icon.png",
      "RAY": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png",
      "WIF": "https://bafkreibk3covs5ltyqxa272uodhculbr6kea6betiez7oz4nwnyg5pj7gm.ipfs.nftstorage.link",
    };

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    const tokenPattern = /\b(SOL|USDC|USDT|BONK|JUP|RAY|WIF)\b/g;
    let match;

    while ((match = tokenPattern.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(content.slice(lastIndex, match.index));
      }

      const token = match[1];
      const logo = TOKEN_LOGOS[token];
      parts.push(
        <span key={match.index} style={{
          display: "inline-flex", alignItems: "center", gap: "4px",
          padding: "2px 8px", borderRadius: "6px",
          backgroundColor: "rgba(255,254,178,0.08)", border: "1px solid rgba(255,254,178,0.15)",
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo && <img src={logo} alt={token} width={16} height={16} style={{ borderRadius: "50%" }} />}
          <span style={{ fontWeight: 600, color: "#fffeb2" }}>{token}</span>
        </span>
      );

      lastIndex = match.index + match[0].length;
    }

    if (parts.length === 0) return renderMarkdown(content);
    if (lastIndex < content.length) parts.push(content.slice(lastIndex));
    return <>{parts}</>;
  }

  /* ---- Derived ---- */
  const isSolana = agent?.category === "solana_agent";
  const catColor = agent ? getCategoryColor(agent.category) : "#fffeb2";

  /* ================================================================ */
  /*  Loading / Error states                                           */
  /* ================================================================ */

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", position: "relative" }}>
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
            backgroundColor: "rgba(0,0,0,0.6)",
          }}
        />
        <div style={{ position: "relative", zIndex: 2 }}>
          <NavBar activeTab="agents" variant="dark" />
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: "calc(100vh - 88px)",
            }}
          >
            <div
              style={{
                fontSize: "16px",
                color: "rgba(255,255,255,0.5)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Loading agent...
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div style={{ minHeight: "100vh", position: "relative" }}>
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
            backgroundColor: "rgba(0,0,0,0.6)",
          }}
        />
        <div style={{ position: "relative", zIndex: 2 }}>
          <NavBar activeTab="agents" variant="dark" />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              height: "calc(100vh - 88px)",
              gap: "16px",
            }}
          >
            <div
              style={{
                fontSize: "16px",
                color: "#f87171",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              {error || "Agent not found"}
            </div>
            <Link
              href="/agents"
              style={{
                fontSize: "13px",
                color: "#fffeb2",
                textDecoration: "none",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                padding: "10px 24px",
                border: "1px solid #fffeb2",
                borderRadius: "8px",
                transition: "all 0.2s ease",
              }}
            >
              Back to Agents
            </Link>
          </div>
        </div>
      </div>
    );
  }

  /* ================================================================ */
  /*  Main layout                                                      */
  /* ================================================================ */

  const walletTruncated = `${agent.walletAddress.slice(0, 4)}...${agent.walletAddress.slice(-4)}`;

  return (
    <div style={{ minHeight: "100vh", position: "relative", fontFamily: "inherit" }}>
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
          backgroundColor: "rgba(0,0,0,0.6)",
        }}
      />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", height: "100vh" }}>
        <NavBar activeTab="agents" variant="dark" />

        <div
          style={{
            flex: 1,
            display: "flex",
            overflow: "hidden",
            maxWidth: "1400px",
            width: "100%",
            margin: "0 auto",
            padding: "0 16px",
          }}
        >
          {/* ---- Mobile sidebar toggle ---- */}
          <button
            className="chat-sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              display: "none",
              position: "fixed",
              bottom: "100px",
              right: "16px",
              zIndex: 100,
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              border: "1px solid rgba(255,254,178,0.3)",
              backgroundColor: "rgba(0,0,0,0.8)",
              backdropFilter: "blur(12px)",
              color: "#fffeb2",
              fontSize: "20px",
              cursor: "pointer",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "inherit",
            }}
          >
            {sidebarOpen ? "\u2715" : "\u2139"}
          </button>

          {/* ============================================================ */}
          {/*  Sidebar                                                      */}
          {/* ============================================================ */}
          <aside
            className="chat-sidebar"
            style={{
              width: "320px",
              flexShrink: 0,
              padding: "24px 16px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}
          >
            {/* Glass card */}
            <div
              style={{
                border: isSolana
                  ? "1px solid rgba(153,69,255,0.25)"
                  : `1px solid ${catColor}25`,
                borderRadius: "16px",
                backgroundColor: "rgba(0,0,0,0.35)",
                backdropFilter: "blur(16px)",
                padding: "28px 20px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "16px",
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: "80px",
                  height: "80px",
                  borderRadius: "16px",
                  overflow: "hidden",
                  flexShrink: 0,
                  border: `2px solid ${catColor}40`,
                }}
              >
                {agent.avatarUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={agent.avatarUrl}
                    alt={agent.name}
                    style={{
                      width: "80px",
                      height: "80px",
                      objectFit: "cover",
                      borderRadius: "14px",
                    }}
                  />
                ) : (
                  <PixelAgent
                    seed={agent.avatarSeed}
                    color={catColor}
                    size={80}
                    state="idle"
                  />
                )}
              </div>

              {/* Name */}
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontSize: "20px",
                    fontWeight: 700,
                    color: "#ffffff",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {agent.name}
                </div>
                <span
                  style={{
                    display: "inline-block",
                    marginTop: "8px",
                    fontSize: "11px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    padding: "4px 12px",
                    borderRadius: "99px",
                    backgroundColor: `${catColor}20`,
                    color: catColor,
                  }}
                >
                  {formatCategory(agent.category)}
                </span>
              </div>

              {/* Solana / Sendai / ElizaOS logos */}
              {isSolana && (
                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/logos/solana.png"
                    alt="Solana"
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "50%",
                    }}
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/logos/sendai.png"
                    alt="Sendai"
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "50%",
                    }}
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/logos/elizaos.png"
                    alt="ElizaOS"
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "50%",
                    }}
                  />
                </div>
              )}

              {/* Info rows */}
              <div
                style={{
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                {/* Model */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "12px",
                  }}
                >
                  <span
                    style={{
                      color: "rgba(255,255,255,0.4)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    Model
                  </span>
                  <span style={{ color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>
                    {formatModel(agent.model)}
                  </span>
                </div>

                {/* Price */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "12px",
                  }}
                >
                  <span
                    style={{
                      color: "rgba(255,255,255,0.4)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    Price
                  </span>
                  <span style={{ color: "#fffeb2", fontWeight: 600 }}>
                    {agent.pricePerPrompt} USDC/prompt
                  </span>
                </div>

                {/* Creator */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "12px",
                  }}
                >
                  <span
                    style={{
                      color: "rgba(255,255,255,0.4)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    Creator
                  </span>
                  <span
                    style={{
                      color: "rgba(255,255,255,0.7)",
                      fontFamily: "monospace",
                      fontSize: "12px",
                    }}
                  >
                    {walletTruncated}
                  </span>
                </div>
              </div>

              {/* Stats */}
              <div
                style={{
                  display: "flex",
                  gap: "24px",
                  width: "100%",
                  justifyContent: "center",
                  paddingTop: "8px",
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      color: "rgba(255,255,255,0.4)",
                      fontSize: "10px",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      marginBottom: "4px",
                    }}
                  >
                    Jobs
                  </div>
                  <div style={{ color: "#fffeb2", fontWeight: 700, fontSize: "16px" }}>
                    {agent.jobsCompleted}
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      color: "rgba(255,255,255,0.4)",
                      fontSize: "10px",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      marginBottom: "4px",
                    }}
                  >
                    Earned
                  </div>
                  <div style={{ color: "#fffeb2", fontWeight: 700, fontSize: "16px" }}>
                    ${agent.totalEarned.toFixed(0)}
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      color: "rgba(255,255,255,0.4)",
                      fontSize: "10px",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      marginBottom: "4px",
                    }}
                  >
                    Revenue
                  </div>
                  <div style={{ color: "#fffeb2", fontWeight: 700, fontSize: "16px" }}>
                    ${agent.totalRevenue.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Badges */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "6px",
                  justifyContent: "center",
                }}
              >
                {agent.webEnabled && (
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      padding: "3px 10px",
                      borderRadius: "4px",
                      backgroundColor: "rgba(255,254,178,0.1)",
                      color: "#fffeb2",
                    }}
                  >
                    Web Access
                  </span>
                )}
                {isSolana && (
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      padding: "3px 10px",
                      borderRadius: "4px",
                      backgroundColor: "rgba(153,69,255,0.15)",
                      color: "#9945FF",
                    }}
                  >
                    Solana Native
                  </span>
                )}
                {agent.onChainTx && (
                  <a
                    href={`https://explorer.solana.com/tx/${agent.onChainTx}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: "10px",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      padding: "3px 10px",
                      borderRadius: "4px",
                      backgroundColor: "rgba(52,211,153,0.15)",
                      color: "#34d399",
                      textDecoration: "none",
                    }}
                  >
                    On-Chain
                  </a>
                )}
              </div>
            </div>

            {/* Back link */}
            <Link
              href="/agents"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "12px",
                color: "rgba(255,255,255,0.4)",
                textDecoration: "none",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                padding: "12px 16px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.06)",
                backgroundColor: "rgba(255,255,255,0.02)",
                transition: "all 0.2s ease",
              }}
            >
              <span style={{ fontSize: "14px" }}>&larr;</span> Back to Agents
            </Link>
          </aside>

          {/* ============================================================ */}
          {/*  Chat panel                                                   */}
          {/* ============================================================ */}
          <main
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
              padding: "24px 0 24px 24px",
            }}
          >
            {/* Chat container */}
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: "16px",
                backgroundColor: "rgba(0,0,0,0.25)",
                backdropFilter: "blur(16px)",
                overflow: "hidden",
              }}
            >
              {/* Header */}
              <div
                style={{
                  padding: "16px 24px",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "8px",
                    overflow: "hidden",
                    flexShrink: 0,
                  }}
                >
                  {agent.avatarUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={agent.avatarUrl}
                      alt={agent.name}
                      style={{
                        width: "32px",
                        height: "32px",
                        objectFit: "cover",
                        borderRadius: "8px",
                      }}
                    />
                  ) : (
                    <PixelAgent
                      seed={agent.avatarSeed}
                      color={catColor}
                      size={32}
                      state={sending ? "thinking" : "idle"}
                    />
                  )}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 700,
                      color: "#ffffff",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {agent.name}
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "rgba(255,255,255,0.35)",
                    }}
                  >
                    {formatModel(agent.model)} &middot; {agent.pricePerPrompt} USDC/prompt
                  </div>
                </div>
                <div style={{ marginLeft: "auto" }}>
                  <div
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      backgroundColor: agent.active ? "#34d399" : "#f87171",
                      boxShadow: agent.active
                        ? "0 0 8px rgba(52,211,153,0.5)"
                        : "0 0 8px rgba(248,113,113,0.5)",
                    }}
                  />
                </div>
              </div>

              {/* Messages */}
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "24px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                }}
              >
                {messages.map((msg) => {
                  const isUser = msg.role === "user";
                  return (
                    <div
                      key={msg.id}
                      style={{
                        display: "flex",
                        justifyContent: isUser ? "flex-end" : "flex-start",
                      }}
                    >
                      <div
                        style={{
                          maxWidth: "75%",
                          padding: "14px 18px",
                          borderRadius: isUser
                            ? "16px 16px 4px 16px"
                            : "16px 16px 16px 4px",
                          backgroundColor: isUser
                            ? "rgba(255,254,178,0.08)"
                            : "rgba(255,255,255,0.04)",
                          border: isUser
                            ? "1px solid rgba(255,254,178,0.12)"
                            : "1px solid rgba(255,255,255,0.06)",
                          fontSize: "14px",
                          lineHeight: 1.6,
                          color: isUser
                            ? "rgba(255,255,255,0.9)"
                            : "rgba(255,255,255,0.85)",
                          wordBreak: "break-word",
                        }}
                      >
                        {msg.typing && msg.text === "" ? (
                          <span style={{ color: "rgba(255,255,255,0.3)" }}>
                            <span className="typing-dots">
                              <span style={{ animation: "blink 1.4s infinite 0s" }}>.</span>
                              <span style={{ animation: "blink 1.4s infinite 0.2s" }}>.</span>
                              <span style={{ animation: "blink 1.4s infinite 0.4s" }}>.</span>
                            </span>
                          </span>
                        ) : msg.role === "agent" ? (
                          <>{renderMessageWithTokens(msg.text)}</>
                        ) : (
                          <>{renderMarkdown(msg.text)}</>
                        )}
                        {msg.typing && msg.text !== "" && (
                          <span
                            style={{
                              display: "inline-block",
                              width: "2px",
                              height: "14px",
                              backgroundColor: "#fffeb2",
                              marginLeft: "2px",
                              animation: "cursor-blink 0.8s infinite",
                              verticalAlign: "text-bottom",
                            }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* x402 Payment Required UI */}
                {paymentRequired && (
                  <div
                    style={{
                      padding: "20px",
                      borderRadius: "12px",
                      border: "1px solid rgba(255,254,178,0.2)",
                      backgroundColor: "rgba(255,254,178,0.05)",
                      backdropFilter: "blur(12px)",
                      textAlign: "center",
                      margin: "16px 0",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "14px",
                        color: "#fffeb2",
                        fontWeight: 600,
                        marginBottom: "8px",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Payment Required
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        color: "rgba(255,255,255,0.6)",
                        marginBottom: "16px",
                        lineHeight: 1.5,
                      }}
                    >
                      This agent charges {agent.pricePerPrompt} USDC per message
                    </div>
                    <button
                      onClick={handlePayment}
                      disabled={paying}
                      style={{
                        fontFamily: "inherit",
                        fontSize: "14px",
                        fontWeight: 700,
                        padding: "12px 32px",
                        borderRadius: "8px",
                        border: "none",
                        backgroundColor: paying ? "rgba(255,254,178,0.3)" : "#fffeb2",
                        color: paying ? "rgba(0,0,0,0.4)" : "#000",
                        cursor: paying ? "not-allowed" : "pointer",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        transition: "all 0.2s ease",
                      }}
                    >
                      {paying ? "Processing..." : `Pay ${agent.pricePerPrompt} USDC & Send`}
                    </button>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "rgba(255,255,255,0.3)",
                        marginTop: "12px",
                      }}
                    >
                      x402 HTTP Payment Protocol
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input area */}
              <div
                style={{
                  padding: "16px 24px",
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                  display: "flex",
                  gap: "12px",
                  alignItems: "flex-end",
                }}
              >
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Message ${agent.name}...`}
                  disabled={sending}
                  rows={1}
                  style={{
                    flex: 1,
                    resize: "none",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "12px",
                    backgroundColor: "rgba(255,255,255,0.04)",
                    color: "#ffffff",
                    padding: "12px 16px",
                    fontSize: "14px",
                    lineHeight: 1.5,
                    fontFamily: "inherit",
                    outline: "none",
                    transition: "border-color 0.2s ease",
                    maxHeight: "120px",
                    overflow: "auto",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "rgba(255,254,178,0.3)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !input.trim()}
                  style={{
                    fontFamily: "inherit",
                    fontSize: "13px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    padding: "12px 24px",
                    border: "none",
                    borderRadius: "12px",
                    backgroundColor:
                      sending || !input.trim()
                        ? "rgba(255,254,178,0.2)"
                        : "#fffeb2",
                    color:
                      sending || !input.trim()
                        ? "rgba(0,0,0,0.3)"
                        : "#000000",
                    cursor:
                      sending || !input.trim() ? "not-allowed" : "pointer",
                    transition: "all 0.2s ease",
                    flexShrink: 0,
                  }}
                >
                  {sending ? "..." : "Send"}
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            backgroundColor: "rgba(0,0,0,0.7)",
          }}
          onClick={() => setSidebarOpen(false)}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              width: "320px",
              maxWidth: "85vw",
              backgroundColor: "rgba(10,10,20,0.98)",
              backdropFilter: "blur(20px)",
              borderLeft: "1px solid rgba(255,255,255,0.08)",
              padding: "24px 16px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setSidebarOpen(false)}
              style={{
                alignSelf: "flex-end",
                background: "none",
                border: "none",
                color: "rgba(255,255,255,0.5)",
                fontSize: "20px",
                cursor: "pointer",
                padding: "4px",
                fontFamily: "inherit",
              }}
            >
              &times;
            </button>

            {/* Duplicate sidebar content for mobile */}
            <div
              style={{
                border: isSolana
                  ? "1px solid rgba(153,69,255,0.25)"
                  : `1px solid ${catColor}25`,
                borderRadius: "16px",
                backgroundColor: "rgba(0,0,0,0.35)",
                backdropFilter: "blur(16px)",
                padding: "28px 20px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "16px",
              }}
            >
              <div
                style={{
                  width: "80px",
                  height: "80px",
                  borderRadius: "16px",
                  overflow: "hidden",
                  border: `2px solid ${catColor}40`,
                }}
              >
                {agent.avatarUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={agent.avatarUrl}
                    alt={agent.name}
                    style={{
                      width: "80px",
                      height: "80px",
                      objectFit: "cover",
                      borderRadius: "14px",
                    }}
                  />
                ) : (
                  <PixelAgent
                    seed={agent.avatarSeed}
                    color={catColor}
                    size={80}
                    state="idle"
                  />
                )}
              </div>
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontSize: "20px",
                    fontWeight: 700,
                    color: "#ffffff",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {agent.name}
                </div>
                <span
                  style={{
                    display: "inline-block",
                    marginTop: "8px",
                    fontSize: "11px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    padding: "4px 12px",
                    borderRadius: "99px",
                    backgroundColor: `${catColor}20`,
                    color: catColor,
                  }}
                >
                  {formatCategory(agent.category)}
                </span>
              </div>

              {isSolana && (
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logos/solana.png" alt="Solana" style={{ width: "24px", height: "24px", borderRadius: "50%" }} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logos/sendai.png" alt="Sendai" style={{ width: "24px", height: "24px", borderRadius: "50%" }} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logos/elizaos.png" alt="ElizaOS" style={{ width: "24px", height: "24px", borderRadius: "50%" }} />
                </div>
              )}

              <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                  <span style={{ color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Model</span>
                  <span style={{ color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>{formatModel(agent.model)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                  <span style={{ color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Price</span>
                  <span style={{ color: "#fffeb2", fontWeight: 600 }}>{agent.pricePerPrompt} USDC/prompt</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                  <span style={{ color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Creator</span>
                  <span style={{ color: "rgba(255,255,255,0.7)", fontFamily: "monospace", fontSize: "12px" }}>{walletTruncated}</span>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "24px",
                  width: "100%",
                  justifyContent: "center",
                  paddingTop: "8px",
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div style={{ textAlign: "center" }}>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "4px" }}>Jobs</div>
                  <div style={{ color: "#fffeb2", fontWeight: 700, fontSize: "16px" }}>{agent.jobsCompleted}</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "4px" }}>Earned</div>
                  <div style={{ color: "#fffeb2", fontWeight: 700, fontSize: "16px" }}>${agent.totalEarned.toFixed(0)}</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "4px" }}>Revenue</div>
                  <div style={{ color: "#fffeb2", fontWeight: 700, fontSize: "16px" }}>${agent.totalRevenue.toFixed(2)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inline styles for animations and responsive */}
      <style jsx global>{`
        @keyframes blink {
          0%, 20% { opacity: 0; }
          50% { opacity: 1; }
          100% { opacity: 0; }
        }

        @keyframes cursor-blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }

        /* Hide desktop sidebar on mobile, show toggle */
        @media (max-width: 768px) {
          .chat-sidebar {
            display: none !important;
          }
          .chat-sidebar-toggle {
            display: flex !important;
          }
        }
      `}</style>
    </div>
  );
}
