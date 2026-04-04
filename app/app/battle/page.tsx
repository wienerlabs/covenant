"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import NavBar from "@/components/NavBar";
import PixelAgent from "@/components/PixelAgent";
import { fireConfetti } from "@/lib/confetti";

type AgentState = "idle" | "thinking" | "working" | "celebrating";

interface BattleEvent {
  step: string;
  message: string;
  data: Record<string, unknown> | null;
}

const ALPHA_CONFIG = {
  name: "AGENT ALPHA",
  role: "CHALLENGER",
  wallet: process.env.NEXT_PUBLIC_AGENT_ALPHA_WALLET || "GMCRqvQyyu5WvoaWF4apE1A39W5SaoXUJkGkdvHpGQ9v",
  color: "#42BDFF",
  avatarSeed: "agent-alpha-covenant-2026",
};

const OMEGA_CONFIG = {
  name: "AGENT OMEGA",
  role: "DEFENDER",
  wallet: process.env.NEXT_PUBLIC_AGENT_OMEGA_WALLET || "55EbEM7x6WQxVFSt1KennwYBPgWF7GgF5bd2R2FVxiw1",
  color: "#FF425E",
  avatarSeed: "agent-omega-covenant-2026",
};

function getTimestamp(): string {
  return new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export default function BattlePage() {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [challenge, setChallenge] = useState("");
  const [alphaState, setAlphaState] = useState<AgentState>("idle");
  const [omegaState, setOmegaState] = useState<AgentState>("idle");

  // Typewriter state
  const [alphaFullText, setAlphaFullText] = useState("");
  const [omegaFullText, setOmegaFullText] = useState("");
  const [alphaDisplayText, setAlphaDisplayText] = useState("");
  const [omegaDisplayText, setOmegaDisplayText] = useState("");
  const [alphaWordCount, setAlphaWordCount] = useState(0);
  const [omegaWordCount, setOmegaWordCount] = useState(0);
  const [alphaHash, setAlphaHash] = useState("");
  const [omegaHash, setOmegaHash] = useState("");
  const [alphaVerified, setAlphaVerified] = useState(false);
  const [omegaVerified, setOmegaVerified] = useState(false);

  // Winner state
  const [winner, setWinner] = useState<string | null>(null);
  const [alphaScore, setAlphaScore] = useState<number | null>(null);
  const [omegaScore, setOmegaScore] = useState<number | null>(null);
  const [judgeReason, setJudgeReason] = useState("");
  const [judging, setJudging] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentTxHash, setPaymentTxHash] = useState<string | null>(null);

  // Chat messages
  const [chatMessages, setChatMessages] = useState<{ agent: string; message: string; timestamp: string; displayText: string }[]>([]);
  const chatPanelRef = useRef<HTMLDivElement>(null);

  // Battle info
  const [battleTitle, setBattleTitle] = useState("");
  const [totalTime, setTotalTime] = useState("");

  // Typewriter effect for alpha text
  useEffect(() => {
    if (!alphaFullText) return;
    let idx = 0;
    setAlphaDisplayText("");
    const interval = setInterval(() => {
      idx++;
      if (idx <= alphaFullText.length) {
        setAlphaDisplayText(alphaFullText.slice(0, idx));
      } else {
        clearInterval(interval);
      }
    }, 20);
    return () => clearInterval(interval);
  }, [alphaFullText]);

  // Typewriter effect for omega text
  useEffect(() => {
    if (!omegaFullText) return;
    let idx = 0;
    setOmegaDisplayText("");
    const interval = setInterval(() => {
      idx++;
      if (idx <= omegaFullText.length) {
        setOmegaDisplayText(omegaFullText.slice(0, idx));
      } else {
        clearInterval(interval);
      }
    }, 20);
    return () => clearInterval(interval);
  }, [omegaFullText]);

  // Typewriter effect for chat messages
  useEffect(() => {
    const lastMsg = chatMessages[chatMessages.length - 1];
    if (!lastMsg || lastMsg.displayText === lastMsg.message) return;

    let idx = lastMsg.displayText.length;
    const interval = setInterval(() => {
      idx++;
      if (idx <= lastMsg.message.length) {
        setChatMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { ...copy[copy.length - 1], displayText: lastMsg.message.slice(0, idx) };
          return copy;
        });
      } else {
        clearInterval(interval);
      }
    }, 20);
    return () => clearInterval(interval);
  }, [chatMessages]);

  useEffect(() => {
    if (chatPanelRef.current) {
      chatPanelRef.current.scrollTop = chatPanelRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleEvent = useCallback((event: BattleEvent) => {
    switch (event.step) {
      case "battle_start":
        if (event.data?.title) {
          setBattleTitle(String(event.data.title));
        }
        break;
      case "agent_chat":
        if (event.data) {
          setChatMessages((prev) => [...prev, {
            agent: String(event.data!.agent || ""),
            message: String(event.data!.message || ""),
            timestamp: getTimestamp(),
            displayText: "",
          }]);
        }
        break;
      case "battle_alpha_working":
        setAlphaState("working");
        break;
      case "battle_omega_working":
        setOmegaState("working");
        break;
      case "battle_alpha_done":
        setAlphaState("celebrating");
        if (event.data) {
          setAlphaFullText(String(event.data.text || ""));
          setAlphaWordCount(Number(event.data.wordCount || 0));
          setAlphaHash(String(event.data.textHash || ""));
          setAlphaVerified(Boolean(event.data.verified));
        }
        setTimeout(() => setAlphaState("idle"), 2000);
        break;
      case "battle_omega_done":
        setOmegaState("celebrating");
        if (event.data) {
          setOmegaFullText(String(event.data.text || ""));
          setOmegaWordCount(Number(event.data.wordCount || 0));
          setOmegaHash(String(event.data.textHash || ""));
          setOmegaVerified(Boolean(event.data.verified));
        }
        setTimeout(() => setOmegaState("idle"), 2000);
        break;
      case "battle_judging":
        setJudging(true);
        break;
      case "battle_winner":
        setJudging(false);
        if (event.data) {
          setWinner(String(event.data.winner));
          setAlphaScore(Number(event.data.alphaScore));
          setOmegaScore(Number(event.data.omegaScore));
          setJudgeReason(String(event.data.reason || ""));
        }
        fireConfetti();
        break;
      case "battle_payment":
        if (event.data) {
          setPaymentAmount(Number(event.data.amount || 0));
          setPaymentTxHash(String(event.data.paymentTxHash || event.data.escrowTxHash || ""));
        }
        break;
      case "battle_complete":
        setDone(true);
        if (event.data) {
          setTotalTime(String(event.data.totalTime || ""));
        }
        fireConfetti();
        break;
      case "error":
        setDone(true);
        break;
    }
  }, []);

  async function startBattle() {
    setRunning(true);
    setDone(false);
    setWinner(null);
    setAlphaScore(null);
    setOmegaScore(null);
    setJudgeReason("");
    setJudging(false);
    setAlphaFullText("");
    setOmegaFullText("");
    setAlphaDisplayText("");
    setOmegaDisplayText("");
    setAlphaWordCount(0);
    setOmegaWordCount(0);
    setAlphaHash("");
    setOmegaHash("");
    setAlphaVerified(false);
    setOmegaVerified(false);
    setAlphaState("idle");
    setOmegaState("idle");
    setChatMessages([]);
    setPaymentAmount(0);
    setPaymentTxHash(null);
    setBattleTitle("");
    setTotalTime("");

    try {
      const response = await fetch("/api/battle/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(challenge ? { jobSpec: { title: challenge } } : {}),
      });

      if (!response.ok || !response.body) {
        setDone(true);
        setRunning(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done: readerDone, value } = await reader.read();
        if (readerDone) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const event: BattleEvent = JSON.parse(trimmed);
            handleEvent(event);
          } catch {
            // Skip malformed lines
          }
        }
      }

      if (buffer.trim()) {
        try {
          handleEvent(JSON.parse(buffer.trim()));
        } catch { /* skip */ }
      }
    } catch (err) {
      console.error("[battle] Error:", err);
    }

    setRunning(false);
  }

  function resetBattle() {
    setDone(false);
    setWinner(null);
    setAlphaScore(null);
    setOmegaScore(null);
    setJudgeReason("");
    setAlphaFullText("");
    setOmegaFullText("");
    setAlphaDisplayText("");
    setOmegaDisplayText("");
    setChatMessages([]);
    setAlphaState("idle");
    setOmegaState("idle");
    setPaymentAmount(0);
    setPaymentTxHash(null);
    setBattleTitle("");
  }

  const isAlphaTyping = alphaFullText.length > 0 && alphaDisplayText.length < alphaFullText.length;
  const isOmegaTyping = omegaFullText.length > 0 && omegaDisplayText.length < omegaFullText.length;

  function renderAgentPanel(
    config: typeof ALPHA_CONFIG,
    state: AgentState,
    displayText: string,
    wordCount: number,
    hash: string,
    verified: boolean,
    isTyping: boolean,
    score: number | null,
    isWinner: boolean,
  ) {
    return (
      <div
        style={{
          flex: 1,
          minWidth: 0,
          backgroundColor: isWinner ? `${config.color}15` : "rgba(0,0,0,0.4)",
          border: isWinner ? `2px solid ${config.color}` : "1px solid rgba(255,255,255,0.12)",
          borderLeft: `3px solid ${config.color}`,
          borderRadius: "12px",
          padding: "20px",
          backdropFilter: "blur(12px)",
          transition: "all 0.3s ease",
          position: "relative" as const,
          overflow: "hidden",
        }}
      >
        {isWinner && (
          <div style={{
            position: "absolute",
            top: "10px",
            right: "10px",
            fontSize: "10px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            padding: "4px 10px",
            borderRadius: "4px",
            backgroundColor: `${config.color}30`,
            color: config.color,
            border: `1px solid ${config.color}50`,
          }}>
            WINNER
          </div>
        )}

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px" }}>
          <PixelAgent seed={config.avatarSeed} color={config.color} size={64} state={state} />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <span style={{ fontSize: "14px", fontWeight: 700, color: "#ffffff" }}>{config.name}</span>
              <span style={{
                fontSize: "9px",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                padding: "2px 8px",
                borderRadius: "4px",
                backgroundColor: `${config.color}25`,
                color: config.color,
                border: `1px solid ${config.color}40`,
                fontWeight: 600,
              }}>
                {config.role}
              </span>
            </div>
            <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", fontFamily: "monospace" }}>
              {config.wallet.slice(0, 4)}...{config.wallet.slice(-4)}
            </div>
            <div style={{ marginTop: "4px" }}>
              <span style={{
                fontSize: "9px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: state === "idle" ? "rgba(255,255,255,0.3)" : config.color,
                fontWeight: state === "idle" ? 400 : 600,
              }}>
                {state === "idle" ? (displayText ? "DONE" : "STANDBY") : state === "working" ? "WRITING..." : state.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* Score */}
        {score !== null && (
          <div style={{
            textAlign: "center",
            padding: "12px",
            marginBottom: "12px",
            backgroundColor: `${config.color}15`,
            borderRadius: "8px",
            border: `1px solid ${config.color}30`,
          }}>
            <div style={{ fontSize: "32px", fontWeight: 700, color: config.color }}>{score}<span style={{ fontSize: "16px", color: "rgba(255,255,255,0.4)" }}>/10</span></div>
          </div>
        )}

        {/* Stats row */}
        {wordCount > 0 && (
          <div style={{
            display: "flex",
            gap: "12px",
            marginBottom: "12px",
            fontSize: "10px",
            color: "rgba(255,255,255,0.5)",
          }}>
            <div>
              <span style={{ color: config.color, fontWeight: 600 }}>{wordCount}</span> words
            </div>
            {hash && (
              <div style={{ fontFamily: "monospace" }}>
                Hash: {hash}...
              </div>
            )}
            {verified && (
              <div style={{ color: "#42BDFF" }}>ZK Verified</div>
            )}
          </div>
        )}

        {/* Live text output with typewriter */}
        <div style={{
          maxHeight: "300px",
          overflowY: "auto",
          fontSize: "11px",
          lineHeight: 1.6,
          color: "rgba(255,255,255,0.75)",
          backgroundColor: "rgba(0,0,0,0.3)",
          borderRadius: "8px",
          padding: "12px",
          border: "1px solid rgba(255,255,255,0.06)",
          minHeight: "80px",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}>
          {displayText ? (
            <>
              {displayText}
              {isTyping && <span style={{ color: config.color, animation: "blink 1s step-end infinite" }}>{"\\u2588"}</span>}
            </>
          ) : (
            <span style={{ color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>
              {state === "working" ? "Writing..." : "Waiting for battle start..."}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: "#0a0a14",
      backgroundImage: "url('/poster-bg.png')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundAttachment: "fixed",
      color: "#ffffff",
    }}>
      <style>{`
        @keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(66, 189, 255, 0.3), 0 0 40px rgba(255, 66, 94, 0.2); }
          50% { box-shadow: 0 0 30px rgba(66, 189, 255, 0.5), 0 0 60px rgba(255, 66, 94, 0.4); }
        }
        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes judging-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      <NavBar activeTab="battle" variant="dark" />

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "32px 20px" }}>
        {/* Title */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <h1 style={{
            fontSize: "36px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            background: "#42BDFF",
            backgroundSize: "200% 200%",
            
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            marginBottom: "8px",
          }}>
            AGENT BATTLE
          </h1>
          <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", letterSpacing: "0.03em" }}>
            Two AI agents compete for the same job. Only one gets paid.
          </p>
          {battleTitle && (
            <div style={{
              marginTop: "12px",
              fontSize: "14px",
              color: "#FFE342",
              fontWeight: 600,
            }}>
              Challenge: {battleTitle}
            </div>
          )}
        </div>

        {/* Start controls */}
        {!running && !done && (
          <div style={{ textAlign: "center", marginBottom: "32px" }}>
            <div style={{ maxWidth: "500px", margin: "0 auto 16px auto" }}>
              <input
                type="text"
                value={challenge}
                onChange={(e) => setChallenge(e.target.value)}
                placeholder="What should they compete on? (or leave blank for random)"
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  fontSize: "13px",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: "8px",
                  color: "#ffffff",
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
            </div>
            <button
              onClick={startBattle}
              style={{
                padding: "16px 48px",
                fontSize: "16px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                background: "#42BDFF",
                color: "#ffffff",
                border: "none",
                borderRadius: "12px",
                cursor: "pointer",
                animation: "pulse-glow 2s ease infinite",
                fontFamily: "inherit",
              }}
            >
              START BATTLE
            </button>
          </div>
        )}

        {done && (
          <div style={{ textAlign: "center", marginBottom: "24px" }}>
            <button
              onClick={resetBattle}
              style={{
                padding: "12px 36px",
                fontSize: "14px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                background: "#42BDFF",
                color: "#ffffff",
                border: "none",
                borderRadius: "10px",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              BATTLE AGAIN
            </button>
            {totalTime && (
              <div style={{ marginTop: "8px", fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>
                Completed in {totalTime}
              </div>
            )}
          </div>
        )}

        {/* Split screen: Alpha vs Omega */}
        <div style={{ display: "flex", gap: "16px", alignItems: "stretch", marginBottom: "24px" }}>
          {/* Alpha panel */}
          {renderAgentPanel(
            ALPHA_CONFIG,
            alphaState,
            alphaDisplayText,
            alphaWordCount,
            alphaHash,
            alphaVerified,
            isAlphaTyping,
            alphaScore,
            winner === "alpha",
          )}

          {/* VS Badge */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}>
            <div style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              background: "#42BDFF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "14px",
              fontWeight: 700,
              color: "#ffffff",
              boxShadow: "0 0 20px rgba(66,189,255,0.3), 0 0 20px rgba(255,66,94,0.3)",
            }}>
              VS
            </div>
          </div>

          {/* Omega panel */}
          {renderAgentPanel(
            OMEGA_CONFIG,
            omegaState,
            omegaDisplayText,
            omegaWordCount,
            omegaHash,
            omegaVerified,
            isOmegaTyping,
            omegaScore,
            winner === "omega",
          )}
        </div>

        {/* Judging / Winner section */}
        {judging && (
          <div style={{
            textAlign: "center",
            padding: "32px",
            marginBottom: "24px",
            backgroundColor: "rgba(0,0,0,0.4)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "12px",
            backdropFilter: "blur(12px)",
          }}>
            <div style={{
              width: "40px",
              height: "40px",
              border: "3px solid rgba(255,227,66,0.3)",
              borderTopColor: "#FFE342",
              borderRadius: "50%",
              animation: "judging-spin 1s linear infinite",
              margin: "0 auto 16px auto",
            }} />
            <div style={{ fontSize: "18px", fontWeight: 700, color: "#FFE342", letterSpacing: "0.1em" }}>
              JUDGING...
            </div>
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginTop: "8px" }}>
              AI Judge is analyzing both submissions
            </div>
          </div>
        )}

        {winner && (
          <div style={{
            padding: "32px",
            marginBottom: "24px",
            backgroundColor: "rgba(0,0,0,0.5)",
            border: `1px solid ${winner === "alpha" ? "#42BDFF" : "#FF425E"}40`,
            borderRadius: "12px",
            backdropFilter: "blur(12px)",
            textAlign: "center",
          }}>
            <div style={{
              fontSize: "28px",
              fontWeight: 700,
              color: winner === "alpha" ? "#42BDFF" : "#FF425E",
              letterSpacing: "0.06em",
              marginBottom: "12px",
              textShadow: `0 0 20px ${winner === "alpha" ? "rgba(66,189,255,0.4)" : "rgba(255,66,94,0.4)"}`,
            }}>
              {winner === "alpha" ? "AGENT ALPHA" : "AGENT OMEGA"} WINS!
            </div>

            {/* Score cards */}
            <div style={{ display: "flex", justifyContent: "center", gap: "32px", marginBottom: "20px" }}>
              <div style={{
                padding: "12px 24px",
                borderRadius: "8px",
                backgroundColor: winner === "alpha" ? "rgba(66,189,255,0.15)" : "rgba(66,189,255,0.05)",
                border: `1px solid ${winner === "alpha" ? "#42BDFF50" : "rgba(255,255,255,0.1)"}`,
              }}>
                <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", marginBottom: "4px" }}>ALPHA</div>
                <div style={{ fontSize: "24px", fontWeight: 700, color: "#42BDFF" }}>{alphaScore}<span style={{ fontSize: "12px" }}>/10</span></div>
              </div>
              <div style={{
                padding: "12px 24px",
                borderRadius: "8px",
                backgroundColor: winner === "omega" ? "rgba(255,66,94,0.15)" : "rgba(255,66,94,0.05)",
                border: `1px solid ${winner === "omega" ? "#FF425E50" : "rgba(255,255,255,0.1)"}`,
              }}>
                <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", marginBottom: "4px" }}>OMEGA</div>
                <div style={{ fontSize: "24px", fontWeight: 700, color: "#FF425E" }}>{omegaScore}<span style={{ fontSize: "12px" }}>/10</span></div>
              </div>
            </div>

            {/* Judge reasoning */}
            {judgeReason && (
              <div style={{
                maxWidth: "600px",
                margin: "0 auto 20px auto",
                padding: "16px",
                backgroundColor: "rgba(255,255,255,0.04)",
                borderRadius: "8px",
                borderLeft: "3px solid #FFE342",
                fontSize: "12px",
                color: "rgba(255,255,255,0.7)",
                lineHeight: 1.6,
                textAlign: "left",
                fontStyle: "italic",
              }}>
                &ldquo;{judgeReason}&rdquo;
              </div>
            )}

            {/* Payment */}
            {paymentAmount > 0 && (
              <div style={{
                fontSize: "14px",
                color: "#FFE342",
                fontWeight: 600,
              }}>
                {paymentAmount} USDC &rarr; {winner === "alpha" ? "Agent Alpha" : "Agent Omega"}
                {paymentTxHash && (
                  <a
                    href={`https://explorer.solana.com/tx/${paymentTxHash}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "rgba(255,255,255,0.3)", fontSize: "10px", marginLeft: "8px", textDecoration: "none" }}
                  >
                    [tx]
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* Chat Panel */}
        {chatMessages.length > 0 && (
          <div style={{
            backgroundColor: "rgba(0,0,0,0.4)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "12px",
            padding: "16px",
            backdropFilter: "blur(12px)",
          }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px" }}>
              Battle Chat
            </div>
            <div ref={chatPanelRef} style={{ maxHeight: "200px", overflowY: "auto" }}>
              {chatMessages.map((msg, i) => {
                const isAlpha = msg.agent === "alpha";
                const agentColor = isAlpha ? "#42BDFF" : "#FF425E";
                const isLastTyping = i === chatMessages.length - 1 && msg.displayText.length < msg.message.length;
                return (
                  <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "8px", alignItems: "flex-start" }}>
                    <span style={{
                      fontSize: "9px",
                      fontWeight: 700,
                      color: agentColor,
                      textTransform: "uppercase",
                      flexShrink: 0,
                      width: "50px",
                      paddingTop: "2px",
                    }}>
                      {isAlpha ? "Alpha" : "Omega"}
                    </span>
                    <span style={{
                      fontSize: "11px",
                      color: "rgba(255,255,255,0.75)",
                      lineHeight: 1.5,
                    }}>
                      {msg.displayText || msg.message}
                      {isLastTyping && <span style={{ color: agentColor, animation: "blink 1s step-end infinite" }}>{"\u2588"}</span>}
                    </span>
                    <span style={{
                      fontSize: "9px",
                      color: "rgba(255,255,255,0.2)",
                      flexShrink: 0,
                      marginLeft: "auto",
                    }}>
                      {msg.timestamp}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
