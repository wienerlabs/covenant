"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import NavBar from "@/components/NavBar";
import PixelAgent from "@/components/PixelAgent";
import CopyButton from "@/components/CopyButton";
import { fireConfetti } from "@/lib/confetti";
import { toast } from "@/lib/toast";
import { JOB_CATEGORIES } from "@/lib/categories";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type AgentState = "idle" | "thinking" | "working" | "celebrating";
type BattlePhase = "setup" | "fighting" | "judging" | "results";

interface BattleEvent {
  step: string;
  message: string;
  data: Record<string, unknown> | null;
}

interface ChatMessage {
  agent: string;
  message: string;
  timestamp: string;
  displayText: string;
}

interface BattleHistoryItem {
  id: string;
  title: string;
  winner: string;
  alphaScore: number;
  omegaScore: number;
  amount: number;
  date: string;
}

interface BattleStats {
  totalBattles: number;
  alphaWins: number;
  omegaWins: number;
  totalStaked: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ALPHA_COLOR = "#42BDFF";
const OMEGA_COLOR = "#FF425E";
const GOLD_COLOR = "#FFE342";

const ALPHA_CONFIG = {
  name: "AGENT ALPHA",
  role: "CHALLENGER",
  wallet: process.env.NEXT_PUBLIC_AGENT_ALPHA_WALLET || "GMCRqvQyyu5WvoaWF4apE1A39W5SaoXUJkGkdvHpGQ9v",
  color: ALPHA_COLOR,
  avatarSeed: "agent-alpha-covenant-2026",
};

const OMEGA_CONFIG = {
  name: "AGENT OMEGA",
  role: "DEFENDER",
  wallet: process.env.NEXT_PUBLIC_AGENT_OMEGA_WALLET || "55EbEM7x6WQxVFSt1KennwYBPgWF7GgF5bd2R2FVxiw1",
  color: OMEGA_COLOR,
  avatarSeed: "agent-omega-covenant-2026",
};

const STAKES_OPTIONS = [10, 25, 50];

const RANDOM_CHALLENGES = [
  "Write a persuasive essay on why decentralized AI will reshape the global economy",
  "Design a tokenomics model for a new AI-powered freelance marketplace",
  "Explain quantum computing to a 12-year-old using only sports analogies",
  "Write a short story about two AIs competing for the same job in 2030",
  "Create a comprehensive guide to zero-knowledge proofs for web developers",
  "Argue for or against universal basic income funded by AI productivity gains",
  "Write a technical deep-dive on Solana's parallel transaction processing",
  "Compose a battle rap between Bitcoin and Ethereum as characters",
  "Draft a whitepaper executive summary for a trustless AI agent marketplace",
  "Explain the Halting Problem and its implications for AI safety",
];

function getTimestamp(): string {
  return new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/* ------------------------------------------------------------------ */
/*  CSS Keyframes & Styles                                             */
/* ------------------------------------------------------------------ */

const BATTLE_STYLES = `
  @keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
  }

  @keyframes pulse-glow-title {
    0%, 100% {
      text-shadow: 0 0 20px rgba(66,189,255,0.4), 0 0 40px rgba(255,66,94,0.2);
      filter: brightness(1);
    }
    50% {
      text-shadow: 0 0 40px rgba(66,189,255,0.7), 0 0 80px rgba(255,66,94,0.5), 0 0 120px rgba(255,227,66,0.3);
      filter: brightness(1.15);
    }
  }

  @keyframes pulse-border {
    0%, 100% { border-color: rgba(255,227,66,0.3); box-shadow: 0 0 15px rgba(255,227,66,0.1); }
    50% { border-color: rgba(255,227,66,0.8); box-shadow: 0 0 30px rgba(255,227,66,0.3); }
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

  @keyframes vs-pulse {
    0%, 100% { transform: scale(1); box-shadow: 0 0 20px rgba(255,227,66,0.2); }
    50% { transform: scale(1.1); box-shadow: 0 0 40px rgba(255,227,66,0.5); }
  }

  @keyframes divider-pulse {
    0%, 100% { opacity: 0.15; }
    50% { opacity: 0.5; }
  }

  @keyframes health-pulse {
    0%, 100% { opacity: 0.8; }
    50% { opacity: 1; }
  }

  @keyframes winner-glow {
    0%, 100% { box-shadow: 0 0 20px rgba(255,227,66,0.3), inset 0 0 20px rgba(255,227,66,0.05); }
    50% { box-shadow: 0 0 40px rgba(255,227,66,0.6), inset 0 0 40px rgba(255,227,66,0.1); }
  }

  @keyframes defeated-stamp {
    0% { transform: scale(3) rotate(-15deg); opacity: 0; }
    50% { transform: scale(1.1) rotate(-15deg); opacity: 0.9; }
    100% { transform: scale(1) rotate(-15deg); opacity: 0.7; }
  }

  @keyframes slide-up {
    0% { transform: translateY(20px); opacity: 0; }
    100% { transform: translateY(0); opacity: 1; }
  }

  @keyframes arrow-flow {
    0% { transform: translateX(-4px); opacity: 0.4; }
    50% { transform: translateX(4px); opacity: 1; }
    100% { transform: translateX(-4px); opacity: 0.4; }
  }

  @keyframes score-pop {
    0% { transform: scale(0); }
    60% { transform: scale(1.2); }
    100% { transform: scale(1); }
  }

  @keyframes float-badge {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-3px); }
  }

  @keyframes scanline {
    0% { transform: translateY(-100%); }
    100% { transform: translateY(100vh); }
  }

  .battle-start-btn:hover {
    transform: scale(1.02) !important;
    filter: brightness(1.15);
  }

  .battle-start-btn:active {
    transform: scale(0.98) !important;
  }

  .category-pill:hover {
    border-color: rgba(255,255,255,0.4) !important;
    background-color: rgba(255,255,255,0.1) !important;
  }

  .stake-btn:hover {
    border-color: ${GOLD_COLOR}80 !important;
    background-color: rgba(255,227,66,0.1) !important;
  }

  .random-btn:hover {
    border-color: ${ALPHA_COLOR}80 !important;
    background-color: rgba(66,189,255,0.15) !important;
  }

  .glass-card {
    background: rgba(255,255,255,0.03);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 16px;
  }

  .glass-card-strong {
    background: rgba(0,0,0,0.5);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 16px;
  }
`;

/* ================================================================== */
/*  COMPONENT                                                          */
/* ================================================================== */

export default function BattlePage() {
  /* ---- Phase & control state ---- */
  const [phase, setPhase] = useState<BattlePhase>("setup");
  const [running, setRunning] = useState(false);
  const [challenge, setChallenge] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("text_writing");
  const [selectedStake, setSelectedStake] = useState(25);

  /* ---- Agent states ---- */
  const [alphaState, setAlphaState] = useState<AgentState>("idle");
  const [omegaState, setOmegaState] = useState<AgentState>("idle");
  const [alphaStatus, setAlphaStatus] = useState<"STANDBY" | "WRITING..." | "SUBMITTED" | "WINNER!" | "DEFEATED">("STANDBY");
  const [omegaStatus, setOmegaStatus] = useState<"STANDBY" | "WRITING..." | "SUBMITTED" | "WINNER!" | "DEFEATED">("STANDBY");

  /* ---- Typewriter state ---- */
  const [alphaFullText, setAlphaFullText] = useState("");
  const [omegaFullText, setOmegaFullText] = useState("");
  const [alphaDisplayText, setAlphaDisplayText] = useState("");
  const [omegaDisplayText, setOmegaDisplayText] = useState("");

  /* ---- Stats ---- */
  const [alphaWordCount, setAlphaWordCount] = useState(0);
  const [omegaWordCount, setOmegaWordCount] = useState(0);
  const [alphaHash, setAlphaHash] = useState("");
  const [omegaHash, setOmegaHash] = useState("");
  const [alphaVerified, setAlphaVerified] = useState(false);
  const [omegaVerified, setOmegaVerified] = useState(false);
  const [alphaTime, setAlphaTime] = useState<string>("");
  const [omegaTime, setOmegaTime] = useState<string>("");

  /* ---- Timers ---- */
  const [alphaTimerRunning, setAlphaTimerRunning] = useState(false);
  const [omegaTimerRunning, setOmegaTimerRunning] = useState(false);
  const [alphaElapsed, setAlphaElapsed] = useState(0);
  const [omegaElapsed, setOmegaElapsed] = useState(0);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [totalTimerRunning, setTotalTimerRunning] = useState(false);
  const alphaTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const omegaTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const totalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ---- Progress bars (0-100) ---- */
  const [alphaProgress, setAlphaProgress] = useState(0);
  const [omegaProgress, setOmegaProgress] = useState(0);

  /* ---- Winner state ---- */
  const [winner, setWinner] = useState<string | null>(null);
  const [alphaScore, setAlphaScore] = useState<number | null>(null);
  const [omegaScore, setOmegaScore] = useState<number | null>(null);
  const [judgeReason, setJudgeReason] = useState("");
  const [judging, setJudging] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentTxHash, setPaymentTxHash] = useState<string | null>(null);

  /* ---- Chat ---- */
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const chatPanelRef = useRef<HTMLDivElement>(null);

  /* ---- Battle info ---- */
  const [battleTitle, setBattleTitle] = useState("");
  const [battleCategory, setBattleCategory] = useState("");
  const [totalTime, setTotalTime] = useState("");

  /* ---- Battle history & stats ---- */
  const [battleHistory, setBattleHistory] = useState<BattleHistoryItem[]>([]);
  const [battleStats, setBattleStats] = useState<BattleStats>({ totalBattles: 0, alphaWins: 0, omegaWins: 0, totalStaked: 0 });

  /* ================================================================ */
  /*  Timer effects                                                    */
  /* ================================================================ */

  useEffect(() => {
    if (alphaTimerRunning) {
      alphaTimerRef.current = setInterval(() => setAlphaElapsed((p) => p + 100), 100);
    } else if (alphaTimerRef.current) {
      clearInterval(alphaTimerRef.current);
    }
    return () => { if (alphaTimerRef.current) clearInterval(alphaTimerRef.current); };
  }, [alphaTimerRunning]);

  useEffect(() => {
    if (omegaTimerRunning) {
      omegaTimerRef.current = setInterval(() => setOmegaElapsed((p) => p + 100), 100);
    } else if (omegaTimerRef.current) {
      clearInterval(omegaTimerRef.current);
    }
    return () => { if (omegaTimerRef.current) clearInterval(omegaTimerRef.current); };
  }, [omegaTimerRunning]);

  useEffect(() => {
    if (totalTimerRunning) {
      totalTimerRef.current = setInterval(() => setTotalElapsed((p) => p + 100), 100);
    } else if (totalTimerRef.current) {
      clearInterval(totalTimerRef.current);
    }
    return () => { if (totalTimerRef.current) clearInterval(totalTimerRef.current); };
  }, [totalTimerRunning]);

  function formatTimer(ms: number): string {
    const secs = Math.floor(ms / 1000);
    const tenths = Math.floor((ms % 1000) / 100);
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return mins > 0 ? `${mins}:${String(s).padStart(2, "0")}.${tenths}` : `${s}.${tenths}s`;
  }

  /* ================================================================ */
  /*  Typewriter effect — 15ms per char                                */
  /* ================================================================ */

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
    }, 15);
    return () => clearInterval(interval);
  }, [alphaFullText]);

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
    }, 15);
    return () => clearInterval(interval);
  }, [omegaFullText]);

  /* ---- Chat typewriter ---- */
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
    }, 15);
    return () => clearInterval(interval);
  }, [chatMessages]);

  useEffect(() => {
    if (chatPanelRef.current) {
      chatPanelRef.current.scrollTop = chatPanelRef.current.scrollHeight;
    }
  }, [chatMessages]);

  /* ================================================================ */
  /*  Fetch battle history & stats on mount                            */
  /* ================================================================ */

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/battle/stats");
        if (res.ok) {
          const data = await res.json();
          setBattleStats(data.stats || { totalBattles: 0, alphaWins: 0, omegaWins: 0, totalStaked: 0 });
          setBattleHistory(data.history || []);
        }
      } catch {
        // Stats endpoint may not exist yet; silently ignore
      }
    }
    fetchStats();
  }, []);

  /* ================================================================ */
  /*  SSE Event Handler                                                */
  /* ================================================================ */

  const handleEvent = useCallback((event: BattleEvent) => {
    switch (event.step) {
      case "battle_start":
        if (event.data?.title) {
          setBattleTitle(String(event.data.title));
        }
        if (event.data?.categoryTag) {
          setBattleCategory(String(event.data.categoryTag));
        }
        setPhase("fighting");
        setTotalTimerRunning(true);
        toast("Battle initialized! Agents are preparing...", "info");
        break;

      case "agent_chat":
      case "battle_chat":
        if (event.data) {
          setChatMessages((prev) => [
            ...prev,
            {
              agent: String(event.data!.agent || ""),
              message: String(event.data!.message || ""),
              timestamp: getTimestamp(),
              displayText: "",
            },
          ]);
        }
        break;

      case "battle_alpha_start":
      case "battle_alpha_working":
        setAlphaState("working");
        setAlphaStatus("WRITING...");
        setAlphaTimerRunning(true);
        break;

      case "battle_alpha_progress":
        if (event.data) {
          const wc = Number(event.data.wordCount || 0);
          setAlphaWordCount(wc);
          const minW = Number(event.data.minWords || 200);
          setAlphaProgress(Math.min(100, Math.round((wc / minW) * 100)));
        }
        break;

      case "battle_alpha_done":
        setAlphaState("celebrating");
        setAlphaStatus("SUBMITTED");
        setAlphaTimerRunning(false);
        if (event.data) {
          setAlphaFullText(String(event.data.text || ""));
          setAlphaWordCount(Number(event.data.wordCount || 0));
          setAlphaHash(String(event.data.textHash || ""));
          setAlphaVerified(Boolean(event.data.verified));
          if (event.data.timeTaken) setAlphaTime(String(event.data.timeTaken));
          setAlphaProgress(100);
        }
        setTimeout(() => setAlphaState("idle"), 2000);
        toast("Agent Alpha submitted!", "success");
        break;

      case "battle_omega_start":
      case "battle_omega_working":
        setOmegaState("working");
        setOmegaStatus("WRITING...");
        setOmegaTimerRunning(true);
        break;

      case "battle_omega_progress":
        if (event.data) {
          const wc = Number(event.data.wordCount || 0);
          setOmegaWordCount(wc);
          const minW = Number(event.data.minWords || 200);
          setOmegaProgress(Math.min(100, Math.round((wc / minW) * 100)));
        }
        break;

      case "battle_omega_done":
        setOmegaState("celebrating");
        setOmegaStatus("SUBMITTED");
        setOmegaTimerRunning(false);
        if (event.data) {
          setOmegaFullText(String(event.data.text || ""));
          setOmegaWordCount(Number(event.data.wordCount || 0));
          setOmegaHash(String(event.data.textHash || ""));
          setOmegaVerified(Boolean(event.data.verified));
          if (event.data.timeTaken) setOmegaTime(String(event.data.timeTaken));
          setOmegaProgress(100);
        }
        setTimeout(() => setOmegaState("idle"), 2000);
        toast("Agent Omega submitted!", "success");
        break;

      case "battle_judging":
        setJudging(true);
        setPhase("judging");
        toast("AI Judge is evaluating...", "info");
        break;

      case "battle_scores":
        if (event.data) {
          setAlphaScore(Number(event.data.alphaScore));
          setOmegaScore(Number(event.data.omegaScore));
          if (event.data.reason) setJudgeReason(String(event.data.reason));
        }
        break;

      case "battle_winner":
        setJudging(false);
        setTotalTimerRunning(false);
        if (event.data) {
          const w = String(event.data.winner);
          setWinner(w);
          if (event.data.alphaScore !== undefined) setAlphaScore(Number(event.data.alphaScore));
          if (event.data.omegaScore !== undefined) setOmegaScore(Number(event.data.omegaScore));
          if (event.data.reason) setJudgeReason(String(event.data.reason));
          // Set status labels
          setAlphaStatus(w === "alpha" ? "WINNER!" : "DEFEATED");
          setOmegaStatus(w === "omega" ? "WINNER!" : "DEFEATED");
        }
        setPhase("results");
        fireConfetti();
        toast("We have a winner!", "success");
        break;

      case "battle_payment":
        if (event.data) {
          setPaymentAmount(Number(event.data.amount || 0));
          setPaymentTxHash(String(event.data.paymentTxHash || event.data.escrowTxHash || ""));
        }
        break;

      case "battle_complete":
        if (event.data) {
          setTotalTime(String(event.data.totalTime || ""));
          // Refresh stats
          if (event.data.winner) {
            setBattleStats((prev) => ({
              totalBattles: prev.totalBattles + 1,
              alphaWins: prev.alphaWins + (String(event.data!.winner) === "alpha" ? 1 : 0),
              omegaWins: prev.omegaWins + (String(event.data!.winner) === "omega" ? 1 : 0),
              totalStaked: prev.totalStaked + (Number(event.data!.amount) || 25),
            }));
          }
        }
        fireConfetti();
        break;

      case "error":
        setPhase("setup");
        setRunning(false);
        toast("Battle error occurred", "error");
        break;
    }
  }, []);

  /* ================================================================ */
  /*  Start Battle                                                     */
  /* ================================================================ */

  async function startBattle() {
    // Reset everything
    setRunning(true);
    setPhase("fighting");
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
    setAlphaStatus("STANDBY");
    setOmegaStatus("STANDBY");
    setAlphaProgress(0);
    setOmegaProgress(0);
    setAlphaElapsed(0);
    setOmegaElapsed(0);
    setTotalElapsed(0);
    setAlphaTime("");
    setOmegaTime("");
    setChatMessages([]);
    setPaymentAmount(0);
    setPaymentTxHash(null);
    setBattleTitle("");
    setBattleCategory("");
    setTotalTime("");

    try {
      const response = await fetch("/api/battle/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobSpec: {
            title: challenge || undefined,
            category: selectedCategory,
            amount: selectedStake,
          },
        }),
      });

      if (!response.ok || !response.body) {
        setPhase("setup");
        setRunning(false);
        toast("Failed to start battle", "error");
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
        } catch {
          /* skip */
        }
      }
    } catch (err) {
      console.error("[battle] Error:", err);
      toast("Battle connection error", "error");
    }

    setRunning(false);
  }

  function resetBattle() {
    setPhase("setup");
    setRunning(false);
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
    setAlphaStatus("STANDBY");
    setOmegaStatus("STANDBY");
    setAlphaProgress(0);
    setOmegaProgress(0);
    setAlphaElapsed(0);
    setOmegaElapsed(0);
    setTotalElapsed(0);
    setPaymentAmount(0);
    setPaymentTxHash(null);
    setBattleTitle("");
    setBattleCategory("");
    setTotalTime("");
  }

  function pickRandomChallenge() {
    const rand = RANDOM_CHALLENGES[Math.floor(Math.random() * RANDOM_CHALLENGES.length)];
    setChallenge(rand);
    toast("Random challenge selected!", "info");
  }

  /* ================================================================ */
  /*  Derived state                                                    */
  /* ================================================================ */

  const isAlphaTyping = alphaFullText.length > 0 && alphaDisplayText.length < alphaFullText.length;
  const isOmegaTyping = omegaFullText.length > 0 && omegaDisplayText.length < omegaFullText.length;
  const bothWriting = alphaState === "working" && omegaState === "working";

  /* ================================================================ */
  /*  RENDER: Agent Panel                                              */
  /* ================================================================ */

  function renderAgentPanel(
    config: typeof ALPHA_CONFIG,
    state: AgentState,
    status: string,
    displayText: string,
    fullText: string,
    wordCount: number,
    hash: string,
    verified: boolean,
    isTyping: boolean,
    score: number | null,
    isWinner: boolean,
    isLoser: boolean,
    elapsed: number,
    timerRunning: boolean,
    progress: number,
    timeTaken: string,
    side: "left" | "right",
  ) {
    const isAlpha = side === "left";

    return (
      <div
        style={{
          flex: 1,
          minWidth: 0,
          position: "relative",
          overflow: "hidden",
          borderRadius: "16px",
          padding: "24px",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          background: isWinner
            ? `linear-gradient(135deg, rgba(255,227,66,0.08), rgba(${isAlpha ? "66,189,255" : "255,66,94"},0.12))`
            : isLoser
            ? "rgba(0,0,0,0.6)"
            : "rgba(0,0,0,0.4)",
          border: isWinner
            ? `2px solid ${GOLD_COLOR}80`
            : isLoser
            ? "1px solid rgba(255,255,255,0.05)"
            : `1px solid rgba(255,255,255,0.1)`,
          opacity: isLoser ? 0.4 : 1,
          transition: "all 0.6s ease",
          animation: isWinner ? "winner-glow 2s ease-in-out infinite" : "none",
        }}
      >
        {/* WINNER! badge */}
        {isWinner && (
          <div
            style={{
              position: "absolute",
              top: "12px",
              right: "12px",
              fontSize: "10px",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              padding: "4px 14px",
              borderRadius: "6px",
              background: `linear-gradient(135deg, ${GOLD_COLOR}, #FFB800)`,
              color: "#000",
              animation: "float-badge 2s ease-in-out infinite",
              boxShadow: `0 0 15px ${GOLD_COLOR}40`,
            }}
          >
            WINNER!
          </div>
        )}

        {/* DEFEATED stamp overlay */}
        {isLoser && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%) rotate(-15deg)",
              fontSize: "48px",
              fontWeight: 900,
              color: "rgba(255,66,94,0.3)",
              letterSpacing: "0.1em",
              pointerEvents: "none",
              zIndex: 10,
              animation: "defeated-stamp 0.6s ease-out forwards",
              textShadow: "0 0 20px rgba(255,66,94,0.2)",
            }}
          >
            DEFEATED
          </div>
        )}

        {/* Header: Avatar + Name + Status */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px" }}>
          <div style={{ position: "relative" }}>
            <div
              style={{
                borderRadius: "14px",
                padding: "3px",
                background: isWinner
                  ? `linear-gradient(135deg, ${GOLD_COLOR}, ${config.color})`
                  : `linear-gradient(135deg, ${config.color}40, ${config.color}20)`,
                boxShadow: state === "working"
                  ? `0 0 20px ${config.color}50, 0 0 40px ${config.color}30`
                  : isWinner
                  ? `0 0 20px ${GOLD_COLOR}50`
                  : "none",
                transition: "all 0.3s ease",
              }}
            >
              <PixelAgent seed={config.avatarSeed} color={config.color} size={80} state={state} />
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
              <span style={{ fontSize: "16px", fontWeight: 800, color: "#ffffff", letterSpacing: "0.03em" }}>
                {config.name}
              </span>
              <span
                style={{
                  fontSize: "9px",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  padding: "3px 10px",
                  borderRadius: "6px",
                  background: `linear-gradient(135deg, ${config.color}30, ${config.color}15)`,
                  color: config.color,
                  border: `1px solid ${config.color}40`,
                  fontWeight: 700,
                }}
              >
                {config.role}
              </span>
            </div>

            <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", fontFamily: "monospace", marginBottom: "6px" }}>
              {config.wallet.slice(0, 6)}...{config.wallet.slice(-4)}
            </div>

            {/* Status indicator */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  backgroundColor:
                    status === "WRITING..."
                      ? config.color
                      : status === "SUBMITTED"
                      ? "#4ade80"
                      : status === "WINNER!"
                      ? GOLD_COLOR
                      : status === "DEFEATED"
                      ? OMEGA_COLOR
                      : "rgba(255,255,255,0.2)",
                  boxShadow:
                    status === "WRITING..." ? `0 0 8px ${config.color}` : "none",
                  animation: status === "WRITING..." ? "health-pulse 1s ease-in-out infinite" : "none",
                }}
              />
              <span
                style={{
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color:
                    status === "WINNER!"
                      ? GOLD_COLOR
                      : status === "DEFEATED"
                      ? "rgba(255,66,94,0.6)"
                      : status === "WRITING..."
                      ? config.color
                      : status === "SUBMITTED"
                      ? "#4ade80"
                      : "rgba(255,255,255,0.3)",
                  fontWeight: status === "STANDBY" ? 400 : 700,
                }}
              >
                {status}
              </span>
            </div>
          </div>

          {/* Timer */}
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: "22px",
                fontWeight: 700,
                fontFamily: "monospace",
                color: timerRunning ? config.color : "rgba(255,255,255,0.5)",
                textShadow: timerRunning ? `0 0 10px ${config.color}40` : "none",
              }}
            >
              {timeTaken || formatTimer(elapsed)}
            </div>
            <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              elapsed
            </div>
          </div>
        </div>

        {/* Health bar / progress */}
        <div
          style={{
            height: "4px",
            backgroundColor: "rgba(255,255,255,0.06)",
            borderRadius: "2px",
            marginBottom: "16px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              backgroundColor: progress >= 100 ? "#4ade80" : config.color,
              borderRadius: "2px",
              transition: "width 0.5s ease",
              boxShadow: progress > 0 ? `0 0 8px ${config.color}60` : "none",
              animation: progress > 0 && progress < 100 ? "health-pulse 1s ease-in-out infinite" : "none",
            }}
          />
        </div>

        {/* Score display (when available) */}
        {score !== null && (
          <div
            style={{
              textAlign: "center",
              padding: "16px",
              marginBottom: "16px",
              background: isWinner
                ? `linear-gradient(135deg, ${GOLD_COLOR}15, ${config.color}15)`
                : `${config.color}10`,
              borderRadius: "12px",
              border: `1px solid ${isWinner ? GOLD_COLOR : config.color}30`,
              animation: "score-pop 0.5s ease-out",
            }}
          >
            <div style={{ fontSize: "42px", fontWeight: 900, color: isWinner ? GOLD_COLOR : config.color, lineHeight: 1 }}>
              {score}
              <span style={{ fontSize: "18px", color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>/10</span>
            </div>
          </div>
        )}

        {/* Stats row */}
        {(wordCount > 0 || hash) && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "12px",
              marginBottom: "12px",
              fontSize: "10px",
              color: "rgba(255,255,255,0.5)",
            }}
          >
            <div
              style={{
                padding: "4px 10px",
                background: "rgba(255,255,255,0.04)",
                borderRadius: "6px",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <span style={{ color: config.color, fontWeight: 700 }}>{wordCount}</span> words
            </div>
            {hash && (
              <div
                style={{
                  padding: "4px 10px",
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: "6px",
                  border: "1px solid rgba(255,255,255,0.06)",
                  fontFamily: "monospace",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                {hash.slice(0, 12)}...
                <CopyButton text={hash} label="Copy hash" />
              </div>
            )}
            {verified !== undefined && fullText && (
              <div
                style={{
                  padding: "4px 10px",
                  background: verified ? "rgba(66,189,255,0.1)" : "rgba(255,66,94,0.1)",
                  borderRadius: "6px",
                  border: `1px solid ${verified ? "rgba(66,189,255,0.2)" : "rgba(255,66,94,0.2)"}`,
                  color: verified ? ALPHA_COLOR : OMEGA_COLOR,
                  fontWeight: 600,
                }}
              >
                {verified ? "SP1 VERIFIED \u2713" : "VERIFYING..."}
              </div>
            )}
          </div>
        )}

        {/* Live text output with typewriter */}
        <div
          style={{
            height: "300px",
            overflowY: "auto",
            fontSize: "12px",
            lineHeight: 1.7,
            color: "rgba(255,255,255,0.75)",
            background: "rgba(0,0,0,0.3)",
            borderRadius: "12px",
            padding: "16px",
            border: "1px solid rgba(255,255,255,0.06)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            position: "relative",
          }}
        >
          {displayText ? (
            <>
              {displayText}
              {isTyping && (
                <span style={{ color: config.color, animation: "blink 1s step-end infinite", fontSize: "14px" }}>
                  {"\u258A"}
                </span>
              )}
            </>
          ) : (
            <span style={{ color: "rgba(255,255,255,0.15)", fontStyle: "italic" }}>
              {state === "working" ? "Writing..." : "Waiting for battle start..."}
            </span>
          )}

          {/* Word count badge (bottom right) */}
          {(wordCount > 0 || isTyping) && (
            <div
              style={{
                position: "sticky",
                bottom: "0",
                textAlign: "right",
                paddingTop: "8px",
              }}
            >
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  color: config.color,
                  background: "rgba(0,0,0,0.7)",
                  padding: "3px 10px",
                  borderRadius: "10px",
                  border: `1px solid ${config.color}30`,
                }}
              >
                {wordCount || displayText.trim().split(/\s+/).filter((w) => w.length > 0).length} words
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ================================================================ */
  /*  RENDER: Main Page                                                */
  /* ================================================================ */

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#0a0a14",
        backgroundImage: "url('/arena-bg.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
        color: "#ffffff",
        position: "relative",
      }}
    >
      {/* Scanline overlay */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)",
          zIndex: 1,
        }}
      />

      <style>{BATTLE_STYLES}</style>

      <NavBar activeTab="battle" variant="dark" />

      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "32px 24px", position: "relative", zIndex: 2 }}>

        {/* ============================================================ */}
        {/*  SECTION 1: PRE-BATTLE SETUP                                 */}
        {/* ============================================================ */}

        {phase === "setup" && (
          <div style={{ animation: "slide-up 0.5s ease-out" }}>
            {/* Title */}
            <div style={{ textAlign: "center", marginBottom: "48px" }}>
              <h1
                style={{
                  fontSize: "56px",
                  fontWeight: 900,
                  letterSpacing: "0.12em",
                  background: `linear-gradient(135deg, ${ALPHA_COLOR}, ${GOLD_COLOR}, ${OMEGA_COLOR})`,
                  backgroundSize: "200% 200%",
                  animation: "gradient-shift 4s ease infinite",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  marginBottom: "4px",
                  lineHeight: 1.1,
                }}
              >
                AGENT BATTLE
              </h1>
              <div
                style={{
                  fontSize: "56px",
                  fontWeight: 900,
                  letterSpacing: "0.12em",
                  color: "transparent",
                  position: "absolute",
                  top: "32px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  WebkitTextStroke: "1px rgba(255,255,255,0.05)",
                  pointerEvents: "none",
                  zIndex: -1,
                }}
              >
                AGENT BATTLE
              </div>
              <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)", letterSpacing: "0.05em" }}>
                Two AI agents compete for the same job. Only one gets paid.
              </p>
            </div>

            {/* VS Preview Cards */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "40px", marginBottom: "48px" }}>
              {/* Alpha mini card */}
              <div
                className="glass-card"
                style={{
                  padding: "20px 28px",
                  textAlign: "center",
                  minWidth: "160px",
                }}
              >
                <PixelAgent seed={ALPHA_CONFIG.avatarSeed} color={ALPHA_COLOR} size={64} state="idle" />
                <div style={{ fontSize: "13px", fontWeight: 700, color: ALPHA_COLOR, marginTop: "10px" }}>
                  AGENT ALPHA
                </div>
                <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Challenger
                </div>
              </div>

              {/* VS text */}
              <div
                style={{
                  fontSize: "36px",
                  fontWeight: 900,
                  background: `linear-gradient(135deg, ${ALPHA_COLOR}, ${OMEGA_COLOR})`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  textShadow: "none",
                  animation: "pulse-glow-title 2s ease-in-out infinite",
                  lineHeight: 1,
                }}
              >
                VS
              </div>

              {/* Omega mini card */}
              <div
                className="glass-card"
                style={{
                  padding: "20px 28px",
                  textAlign: "center",
                  minWidth: "160px",
                }}
              >
                <PixelAgent seed={OMEGA_CONFIG.avatarSeed} color={OMEGA_COLOR} size={64} state="idle" />
                <div style={{ fontSize: "13px", fontWeight: 700, color: OMEGA_COLOR, marginTop: "10px" }}>
                  AGENT OMEGA
                </div>
                <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Defender
                </div>
              </div>
            </div>

            {/* Challenge Input */}
            <div style={{ maxWidth: "600px", margin: "0 auto 24px auto" }}>
              <label style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px", display: "block" }}>
                Battle Challenge
              </label>
              <textarea
                value={challenge}
                onChange={(e) => setChallenge(e.target.value)}
                placeholder="Describe the challenge..."
                rows={3}
                style={{
                  width: "100%",
                  padding: "14px 18px",
                  fontSize: "14px",
                  background: "rgba(255,255,255,0.04)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "12px",
                  color: "#ffffff",
                  outline: "none",
                  fontFamily: "inherit",
                  resize: "vertical",
                  lineHeight: 1.6,
                }}
              />
              <div style={{ textAlign: "right", marginTop: "8px" }}>
                <button
                  className="random-btn"
                  onClick={pickRandomChallenge}
                  style={{
                    fontFamily: "inherit",
                    fontSize: "11px",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    padding: "8px 20px",
                    borderRadius: "8px",
                    border: `1px solid ${ALPHA_COLOR}40`,
                    background: "rgba(66,189,255,0.08)",
                    color: ALPHA_COLOR,
                    cursor: "pointer",
                    fontWeight: 600,
                    transition: "all 0.2s ease",
                  }}
                >
                  RANDOM CHALLENGE
                </button>
              </div>
            </div>

            {/* Category Selector */}
            <div style={{ maxWidth: "600px", margin: "0 auto 24px auto" }}>
              <label style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px", display: "block" }}>
                Category
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {JOB_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    className="category-pill"
                    onClick={() => setSelectedCategory(cat.id)}
                    style={{
                      fontFamily: "inherit",
                      fontSize: "11px",
                      padding: "8px 16px",
                      borderRadius: "20px",
                      border:
                        selectedCategory === cat.id
                          ? `1px solid ${ALPHA_COLOR}`
                          : "1px solid rgba(255,255,255,0.12)",
                      background:
                        selectedCategory === cat.id
                          ? `${ALPHA_COLOR}20`
                          : "rgba(255,255,255,0.04)",
                      color:
                        selectedCategory === cat.id ? ALPHA_COLOR : "rgba(255,255,255,0.6)",
                      cursor: "pointer",
                      fontWeight: selectedCategory === cat.id ? 700 : 400,
                      transition: "all 0.2s ease",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {cat.tag} {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Stakes Selector */}
            <div style={{ maxWidth: "600px", margin: "0 auto 32px auto" }}>
              <label style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px", display: "block" }}>
                Stakes
              </label>
              <div style={{ display: "flex", gap: "12px" }}>
                {STAKES_OPTIONS.map((amount) => (
                  <button
                    key={amount}
                    className="stake-btn"
                    onClick={() => setSelectedStake(amount)}
                    style={{
                      flex: 1,
                      fontFamily: "inherit",
                      fontSize: "16px",
                      fontWeight: 800,
                      padding: "14px 0",
                      borderRadius: "12px",
                      border:
                        selectedStake === amount
                          ? `2px solid ${GOLD_COLOR}`
                          : "1px solid rgba(255,255,255,0.12)",
                      background:
                        selectedStake === amount
                          ? `${GOLD_COLOR}15`
                          : "rgba(255,255,255,0.04)",
                      color:
                        selectedStake === amount ? GOLD_COLOR : "rgba(255,255,255,0.5)",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      boxShadow:
                        selectedStake === amount ? `0 0 20px ${GOLD_COLOR}20` : "none",
                    }}
                  >
                    {amount} <span style={{ fontSize: "10px", fontWeight: 400, opacity: 0.6 }}>USDC</span>
                  </button>
                ))}
              </div>
            </div>

            {/* START BATTLE button */}
            <div style={{ textAlign: "center", marginBottom: "24px" }}>
              <button
                className="battle-start-btn"
                onClick={startBattle}
                style={{
                  fontFamily: "inherit",
                  fontSize: "20px",
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.15em",
                  padding: "20px 0",
                  width: "100%",
                  maxWidth: "600px",
                  background: `linear-gradient(135deg, ${OMEGA_COLOR}, #cc1833)`,
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "16px",
                  cursor: "pointer",
                  boxShadow: `0 0 30px ${OMEGA_COLOR}40, 0 4px 20px rgba(0,0,0,0.4)`,
                  transition: "all 0.2s ease",
                }}
              >
                START BATTLE
              </button>
              <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginTop: "12px", maxWidth: "500px", margin: "12px auto 0 auto" }}>
                Both agents will compete. AI judge decides. Winner takes all.
              </p>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/*  SECTION 6: STATS BAR                                        */}
        {/* ============================================================ */}

        {(phase === "fighting" || phase === "judging" || phase === "results") && (
          <div style={{ marginBottom: "28px", animation: "slide-up 0.3s ease-out" }}>
            {/* Battle title when active */}
            {battleTitle && (
              <div style={{ textAlign: "center", marginBottom: "20px" }}>
                <h2
                  style={{
                    fontSize: "28px",
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                    background: `linear-gradient(135deg, ${ALPHA_COLOR}, ${OMEGA_COLOR})`,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    marginBottom: "4px",
                  }}
                >
                  AGENT BATTLE
                </h2>
                <div style={{ fontSize: "14px", color: GOLD_COLOR, fontWeight: 600 }}>
                  {battleCategory && (
                    <span
                      style={{
                        fontSize: "9px",
                        background: `${GOLD_COLOR}20`,
                        border: `1px solid ${GOLD_COLOR}30`,
                        borderRadius: "4px",
                        padding: "2px 8px",
                        marginRight: "8px",
                        verticalAlign: "middle",
                      }}
                    >
                      {battleCategory}
                    </span>
                  )}
                  {battleTitle}
                </div>
              </div>
            )}

            {/* Stats bar */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "12px",
              }}
            >
              {[
                { label: "TOTAL BATTLES", value: battleStats.totalBattles, color: "rgba(255,255,255,0.8)" },
                { label: "ALPHA WINS", value: battleStats.alphaWins, color: ALPHA_COLOR },
                { label: "OMEGA WINS", value: battleStats.omegaWins, color: OMEGA_COLOR },
                { label: "TOTAL STAKED", value: `${battleStats.totalStaked} USDC`, color: GOLD_COLOR },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="glass-card"
                  style={{
                    padding: "16px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: "24px", fontWeight: 800, color: stat.color as string, marginBottom: "4px" }}>
                    {stat.value}
                  </div>
                  <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/*  SECTION 2: BATTLE ARENA                                     */}
        {/* ============================================================ */}

        {(phase === "fighting" || phase === "judging" || phase === "results") && (
          <div style={{ marginBottom: "28px" }}>
            <div style={{ display: "flex", gap: "0px", alignItems: "stretch" }}>
              {/* Alpha Panel */}
              {renderAgentPanel(
                ALPHA_CONFIG,
                alphaState,
                alphaStatus,
                alphaDisplayText,
                alphaFullText,
                alphaWordCount,
                alphaHash,
                alphaVerified,
                isAlphaTyping,
                alphaScore,
                winner === "alpha",
                winner === "omega",
                alphaElapsed,
                alphaTimerRunning,
                alphaProgress,
                alphaTime,
                "left",
              )}

              {/* Center Divider with VS */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 16px",
                  position: "relative",
                  flexShrink: 0,
                }}
              >
                {/* Vertical line */}
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    width: "1px",
                    background: `linear-gradient(to bottom, transparent, ${bothWriting ? GOLD_COLOR : "rgba(255,255,255,0.15)"}, transparent)`,
                    animation: bothWriting ? "divider-pulse 1.5s ease-in-out infinite" : "none",
                  }}
                />

                {/* VS Badge */}
                <div
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "50%",
                    background: `linear-gradient(135deg, ${ALPHA_COLOR}30, ${OMEGA_COLOR}30)`,
                    border: `2px solid ${bothWriting ? GOLD_COLOR : "rgba(255,255,255,0.15)"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "16px",
                    fontWeight: 900,
                    color: "#ffffff",
                    zIndex: 5,
                    animation: bothWriting ? "vs-pulse 2s ease-in-out infinite" : "none",
                    boxShadow: bothWriting
                      ? `0 0 20px ${ALPHA_COLOR}30, 0 0 20px ${OMEGA_COLOR}30`
                      : "0 0 10px rgba(0,0,0,0.3)",
                    backdropFilter: "blur(8px)",
                  }}
                >
                  VS
                </div>

                {/* Total elapsed */}
                <div
                  style={{
                    marginTop: "12px",
                    fontSize: "12px",
                    fontFamily: "monospace",
                    color: "rgba(255,255,255,0.4)",
                    textAlign: "center",
                    zIndex: 5,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{formatTimer(totalElapsed)}</div>
                  <div style={{ fontSize: "7px", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.2)" }}>
                    total
                  </div>
                </div>
              </div>

              {/* Omega Panel */}
              {renderAgentPanel(
                OMEGA_CONFIG,
                omegaState,
                omegaStatus,
                omegaDisplayText,
                omegaFullText,
                omegaWordCount,
                omegaHash,
                omegaVerified,
                isOmegaTyping,
                omegaScore,
                winner === "omega",
                winner === "alpha",
                omegaElapsed,
                omegaTimerRunning,
                omegaProgress,
                omegaTime,
                "right",
              )}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/*  SECTION 3: JUDGING PHASE                                    */}
        {/* ============================================================ */}

        {judging && (
          <div
            className="glass-card-strong"
            style={{
              textAlign: "center",
              padding: "48px 32px",
              marginBottom: "28px",
              animation: "slide-up 0.4s ease-out",
            }}
          >
            <div
              style={{
                width: "60px",
                height: "60px",
                border: `3px solid ${GOLD_COLOR}30`,
                borderTopColor: GOLD_COLOR,
                borderRadius: "50%",
                animation: "judging-spin 0.8s linear infinite",
                margin: "0 auto 20px auto",
              }}
            />
            <div
              style={{
                fontSize: "24px",
                fontWeight: 900,
                color: GOLD_COLOR,
                letterSpacing: "0.15em",
                textShadow: `0 0 30px ${GOLD_COLOR}40`,
                marginBottom: "8px",
              }}
            >
              AI JUDGE EVALUATING...
            </div>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>
              Analyzing both submissions for quality, relevance, completeness, and creativity
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/*  SECTION 3b: WINNER ANNOUNCEMENT (score display)             */}
        {/* ============================================================ */}

        {winner && !judging && (
          <div
            className="glass-card-strong"
            style={{
              textAlign: "center",
              padding: "32px",
              marginBottom: "28px",
              borderColor: winner === "alpha" ? `${ALPHA_COLOR}40` : `${OMEGA_COLOR}40`,
              animation: "slide-up 0.5s ease-out",
            }}
          >
            {/* Winner name */}
            <div
              style={{
                fontSize: "36px",
                fontWeight: 900,
                letterSpacing: "0.08em",
                color: GOLD_COLOR,
                textShadow: `0 0 30px ${GOLD_COLOR}50`,
                marginBottom: "8px",
              }}
            >
              {winner === "alpha" ? "AGENT ALPHA" : "AGENT OMEGA"} WINS!
            </div>

            {/* Score display */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "24px",
                fontSize: "48px",
                fontWeight: 900,
                marginBottom: "20px",
                lineHeight: 1,
              }}
            >
              <span style={{ color: ALPHA_COLOR, textShadow: winner === "alpha" ? `0 0 20px ${ALPHA_COLOR}50` : "none" }}>
                {alphaScore !== null ? alphaScore : "?"}
              </span>
              <span style={{ fontSize: "20px", color: "rgba(255,255,255,0.2)" }}>&mdash;</span>
              <span style={{ color: OMEGA_COLOR, textShadow: winner === "omega" ? `0 0 20px ${OMEGA_COLOR}50` : "none" }}>
                {omegaScore !== null ? omegaScore : "?"}
              </span>
            </div>
            <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", letterSpacing: "0.15em", textTransform: "uppercase" }}>
              ALPHA &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; OMEGA
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/*  SECTION 4: RESULTS CARD                                     */}
        {/* ============================================================ */}

        {winner && phase === "results" && (
          <div style={{ animation: "slide-up 0.6s ease-out" }}>
            {/* Score Comparison Table */}
            <div
              className="glass-card-strong"
              style={{ padding: "28px", marginBottom: "20px" }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  marginBottom: "20px",
                  textAlign: "center",
                }}
              >
                Score Comparison
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px 1fr 1fr",
                  gap: "0",
                  fontSize: "12px",
                }}
              >
                {/* Header */}
                <div style={{ padding: "10px 12px", color: "rgba(255,255,255,0.3)", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.06)" }} />
                <div
                  style={{
                    padding: "10px 12px",
                    textAlign: "center",
                    color: ALPHA_COLOR,
                    fontWeight: 800,
                    fontSize: "13px",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  ALPHA
                </div>
                <div
                  style={{
                    padding: "10px 12px",
                    textAlign: "center",
                    color: OMEGA_COLOR,
                    fontWeight: 800,
                    fontSize: "13px",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  OMEGA
                </div>

                {/* Rows */}
                {[
                  { label: "Score", alpha: `${alphaScore}/10`, omega: `${omegaScore}/10` },
                  { label: "Words", alpha: String(alphaWordCount), omega: String(omegaWordCount) },
                  { label: "Time", alpha: alphaTime || formatTimer(alphaElapsed), omega: omegaTime || formatTimer(omegaElapsed) },
                  { label: "Hash", alpha: alphaHash ? `${alphaHash.slice(0, 10)}...` : "-", omega: omegaHash ? `${omegaHash.slice(0, 10)}...` : "-" },
                  { label: "ZK Proof", alpha: alphaVerified ? "\u2713 Verified" : "Pending", omega: omegaVerified ? "\u2713 Verified" : "Pending" },
                ].map((row) => (
                  <div key={row.label} style={{ display: "contents" }}>
                    <div
                      style={{
                        padding: "10px 12px",
                        color: "rgba(255,255,255,0.4)",
                        fontWeight: 600,
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                        textTransform: "uppercase",
                        fontSize: "10px",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {row.label}
                    </div>
                    <div
                      style={{
                        padding: "10px 12px",
                        textAlign: "center",
                        color: "rgba(255,255,255,0.7)",
                        fontFamily: row.label === "Hash" ? "monospace" : "inherit",
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                        fontWeight: row.label === "Score" ? 700 : 400,
                      }}
                    >
                      {row.alpha}
                    </div>
                    <div
                      style={{
                        padding: "10px 12px",
                        textAlign: "center",
                        color: "rgba(255,255,255,0.7)",
                        fontFamily: row.label === "Hash" ? "monospace" : "inherit",
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                        fontWeight: row.label === "Score" ? 700 : 400,
                      }}
                    >
                      {row.omega}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Judge's Analysis */}
            {judgeReason && (
              <div
                className="glass-card-strong"
                style={{ padding: "24px", marginBottom: "20px" }}
              >
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "rgba(255,255,255,0.3)",
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    marginBottom: "16px",
                  }}
                >
                  Judge&apos;s Analysis
                </div>
                <div
                  style={{
                    padding: "20px",
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: "12px",
                    borderLeft: `3px solid ${GOLD_COLOR}`,
                    fontSize: "13px",
                    color: "rgba(255,255,255,0.7)",
                    lineHeight: 1.8,
                    fontStyle: "italic",
                  }}
                >
                  &ldquo;{judgeReason}&rdquo;
                </div>
                <div style={{ marginTop: "10px", fontSize: "10px", color: "rgba(255,255,255,0.25)" }}>
                  Judge: Claude Haiku 4.5
                </div>
              </div>
            )}

            {/* Payment */}
            {paymentAmount > 0 && (
              <div
                className="glass-card-strong"
                style={{
                  padding: "24px",
                  marginBottom: "20px",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "rgba(255,255,255,0.3)",
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    marginBottom: "16px",
                  }}
                >
                  Payment
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "16px" }}>
                  <div
                    style={{
                      padding: "10px 20px",
                      background: "rgba(255,255,255,0.04)",
                      borderRadius: "10px",
                      border: "1px solid rgba(255,255,255,0.1)",
                      fontSize: "12px",
                      color: "rgba(255,255,255,0.5)",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    ESCROW
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ color: GOLD_COLOR, fontSize: "20px", animation: "arrow-flow 1.5s ease-in-out infinite" }}>
                      &rarr;
                    </span>
                    <span style={{ color: GOLD_COLOR, fontSize: "20px", animation: "arrow-flow 1.5s ease-in-out infinite 0.3s" }}>
                      &rarr;
                    </span>
                    <span style={{ color: GOLD_COLOR, fontSize: "20px", animation: "arrow-flow 1.5s ease-in-out infinite 0.6s" }}>
                      &rarr;
                    </span>
                  </div>
                  <div
                    style={{
                      padding: "10px 20px",
                      background: `${winner === "alpha" ? ALPHA_COLOR : OMEGA_COLOR}15`,
                      borderRadius: "10px",
                      border: `1px solid ${winner === "alpha" ? ALPHA_COLOR : OMEGA_COLOR}30`,
                      fontSize: "12px",
                      color: winner === "alpha" ? ALPHA_COLOR : OMEGA_COLOR,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    WINNER
                  </div>
                </div>
                <div style={{ marginTop: "16px" }}>
                  <span style={{ fontSize: "28px", fontWeight: 900, color: GOLD_COLOR }}>
                    {paymentAmount}
                  </span>
                  <span style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)", marginLeft: "8px" }}>
                    USDC
                  </span>
                </div>
                {paymentTxHash && (
                  <div style={{ marginTop: "10px" }}>
                    <a
                      href={`https://explorer.solana.com/tx/${paymentTxHash}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: "10px",
                        color: "rgba(255,255,255,0.3)",
                        textDecoration: "none",
                        fontFamily: "monospace",
                        borderBottom: "1px dashed rgba(255,255,255,0.2)",
                        paddingBottom: "1px",
                      }}
                    >
                      TX: {paymentTxHash.slice(0, 16)}...{paymentTxHash.slice(-8)}
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* BATTLE AGAIN button */}
            <div style={{ textAlign: "center", marginBottom: "32px" }}>
              <button
                className="battle-start-btn"
                onClick={resetBattle}
                style={{
                  fontFamily: "inherit",
                  fontSize: "16px",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  padding: "16px 48px",
                  background: `linear-gradient(135deg, ${ALPHA_COLOR}, ${OMEGA_COLOR})`,
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "14px",
                  cursor: "pointer",
                  boxShadow: `0 0 20px ${ALPHA_COLOR}30, 0 0 20px ${OMEGA_COLOR}30`,
                  transition: "all 0.2s ease",
                }}
              >
                BATTLE AGAIN
              </button>
              {totalTime && (
                <div style={{ marginTop: "10px", fontSize: "11px", color: "rgba(255,255,255,0.25)" }}>
                  Completed in {totalTime}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/*  Agent Chat — always show when messages exist                 */}
        {/* ============================================================ */}

        {chatMessages.length > 0 && (
          <div
            className="glass-card-strong"
            style={{ padding: "20px", marginBottom: "28px" }}
          >
            <div
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "rgba(255,255,255,0.3)",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                marginBottom: "16px",
              }}
            >
              Agent Chat
            </div>
            <div ref={chatPanelRef} style={{ maxHeight: "280px", overflowY: "auto" }}>
              {chatMessages.map((msg, i) => {
                const isAlpha = msg.agent === "alpha";
                const agentColor = isAlpha ? ALPHA_COLOR : OMEGA_COLOR;
                const isLastTyping = i === chatMessages.length - 1 && msg.displayText.length < msg.message.length;
                const alignment = isAlpha ? "flex-start" : "flex-end";

                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: alignment,
                      marginBottom: "10px",
                    }}
                  >
                    <div
                      style={{
                        maxWidth: "70%",
                        padding: "10px 16px",
                        borderRadius: isAlpha ? "16px 16px 16px 4px" : "16px 16px 4px 16px",
                        background: `${agentColor}15`,
                        border: `1px solid ${agentColor}25`,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                        <span
                          style={{
                            fontSize: "9px",
                            fontWeight: 800,
                            color: agentColor,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                          }}
                        >
                          {isAlpha ? "Alpha" : "Omega"}
                        </span>
                        <span style={{ fontSize: "8px", color: "rgba(255,255,255,0.15)" }}>
                          {msg.timestamp}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "rgba(255,255,255,0.8)",
                          lineHeight: 1.6,
                        }}
                      >
                        {msg.displayText || msg.message}
                        {isLastTyping && (
                          <span style={{ color: agentColor, animation: "blink 1s step-end infinite" }}>
                            {"\u258A"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/*  SECTION 5: BATTLE HISTORY                                   */}
        {/* ============================================================ */}

        {battleHistory.length > 0 && (
          <div
            className="glass-card-strong"
            style={{ padding: "24px", marginBottom: "28px" }}
          >
            <div
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "rgba(255,255,255,0.3)",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                marginBottom: "20px",
              }}
            >
              Battle History
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {battleHistory.slice(0, 5).map((battle) => (
                <div
                  key={battle.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "100px 1fr 120px 80px",
                    alignItems: "center",
                    padding: "12px 16px",
                    background: "rgba(255,255,255,0.02)",
                    borderRadius: "10px",
                    border: "1px solid rgba(255,255,255,0.04)",
                    fontSize: "11px",
                  }}
                >
                  <div style={{ color: "rgba(255,255,255,0.3)", fontFamily: "monospace", fontSize: "10px" }}>
                    {new Date(battle.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {battle.title}
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <span style={{ color: ALPHA_COLOR, fontWeight: 700 }}>{battle.alphaScore}</span>
                    <span style={{ color: "rgba(255,255,255,0.2)", margin: "0 6px" }}>&mdash;</span>
                    <span style={{ color: OMEGA_COLOR, fontWeight: 700 }}>{battle.omegaScore}</span>
                  </div>
                  <div
                    style={{
                      textAlign: "right",
                      color: battle.winner === "alpha" ? ALPHA_COLOR : OMEGA_COLOR,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      fontSize: "10px",
                    }}
                  >
                    {battle.winner === "alpha" ? "Alpha" : "Omega"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/*  SECTION 6b: STATS BAR (setup phase)                         */}
        {/* ============================================================ */}

        {phase === "setup" && battleStats.totalBattles > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "12px",
              marginBottom: "28px",
            }}
          >
            {[
              { label: "TOTAL BATTLES", value: battleStats.totalBattles, color: "rgba(255,255,255,0.8)" },
              { label: "ALPHA WINS", value: battleStats.alphaWins, color: ALPHA_COLOR },
              { label: "OMEGA WINS", value: battleStats.omegaWins, color: OMEGA_COLOR },
              { label: "TOTAL STAKED", value: `${battleStats.totalStaked} USDC`, color: GOLD_COLOR },
            ].map((stat) => (
              <div
                key={stat.label}
                className="glass-card"
                style={{
                  padding: "16px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "24px", fontWeight: 800, color: stat.color as string, marginBottom: "4px" }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Setup phase battle history */}
        {phase === "setup" && battleHistory.length > 0 && (
          <div
            className="glass-card-strong"
            style={{ padding: "24px" }}
          >
            <div
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "rgba(255,255,255,0.3)",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                marginBottom: "20px",
              }}
            >
              Battle History
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {battleHistory.slice(0, 5).map((battle) => (
                <div
                  key={battle.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "100px 1fr 120px 80px",
                    alignItems: "center",
                    padding: "12px 16px",
                    background: "rgba(255,255,255,0.02)",
                    borderRadius: "10px",
                    border: "1px solid rgba(255,255,255,0.04)",
                    fontSize: "11px",
                  }}
                >
                  <div style={{ color: "rgba(255,255,255,0.3)", fontFamily: "monospace", fontSize: "10px" }}>
                    {new Date(battle.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {battle.title}
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <span style={{ color: ALPHA_COLOR, fontWeight: 700 }}>{battle.alphaScore}</span>
                    <span style={{ color: "rgba(255,255,255,0.2)", margin: "0 6px" }}>&mdash;</span>
                    <span style={{ color: OMEGA_COLOR, fontWeight: 700 }}>{battle.omegaScore}</span>
                  </div>
                  <div
                    style={{
                      textAlign: "right",
                      color: battle.winner === "alpha" ? ALPHA_COLOR : OMEGA_COLOR,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      fontSize: "10px",
                    }}
                  >
                    {battle.winner === "alpha" ? "Alpha" : "Omega"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
