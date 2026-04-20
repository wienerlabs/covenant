"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import NavBar from "@/components/NavBar";
import PixelAgent from "@/components/PixelAgent";
import PixelBattle from "@/components/PixelBattle";
import CopyButton from "@/components/CopyButton";
import BattleReactions from "@/components/BattleReactions";
import { fireConfetti } from "@/lib/confetti";
import { toast } from "@/lib/toast";
import { JOB_CATEGORIES } from "@/lib/categories";
import { useConnector } from "@solana/connector/react";

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
  agent: string;           // "alpha" | "omega"
  agentName?: string;      // custom agent name, falls back to capitalized side
  phase?: string;          // "pre_battle" | "post_battle" | "mid_battle" | etc.
  message: string;
  timestamp: string;
  displayText: string;
}

interface BattleHistoryItem {
  id: string;
  title: string;
  winner: string;           // "alpha" | "omega"
  alphaScore: number;
  omegaScore: number;
  amount: number;
  date: string;
  category?: string;
  // Agent identity — filled in from arena API enrichment
  alphaName?: string;
  omegaName?: string;
  alphaAvatarUrl?: string | null;
  omegaAvatarUrl?: string | null;
  alphaAvatarSeed?: string | null;
  omegaAvatarSeed?: string | null;
  alphaEloDelta?: number;
  omegaEloDelta?: number;
  alphaEloAfter?: number;
  omegaEloAfter?: number;
}

interface BattleStats {
  totalBattles: number;
  alphaWins: number;
  omegaWins: number;
  totalStaked: number;
}

interface AgentEloData {
  elo: number;
  wins: number;
  losses: number;
  peakElo: number;
  currentStreak: number;
  bestStreak: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ALPHA_COLOR = "#fffeb2";
const OMEGA_COLOR = "#FF425E";
const GOLD_COLOR = "#fffeb2";

const ALPHA_WALLET =
  process.env.NEXT_PUBLIC_AGENT_ALPHA_WALLET ||
  "7GpXEwNrf8BVFBGMYjuYHoSmN1FvGFQD1MTtgJk2u7fG";
const OMEGA_WALLET =
  process.env.NEXT_PUBLIC_AGENT_OMEGA_WALLET ||
  "55EbEM7x6WQxVFSt1KennwYBPgWF7GgF5bd2R2FVxiw1";

const ALPHA_CONFIG = {
  name: "AGENT ALPHA",
  role: "CHALLENGER",
  wallet: ALPHA_WALLET,
  color: ALPHA_COLOR,
  avatarSeed: "agent-alpha-covenant-2026",
};

const OMEGA_CONFIG = {
  name: "AGENT OMEGA",
  role: "DEFENDER",
  wallet: OMEGA_WALLET,
  color: OMEGA_COLOR,
  avatarSeed: "agent-omega-covenant-2026",
};

const STAKES_OPTIONS = [10, 25, 50];

const RANDOM_CHALLENGES = [
  "Write a persuasive essay on why decentralized AI will reshape the global economy",
  "Design a tokenomics model for a new AI-powered freelance marketplace",
  "Explain quantum computing to a 12-year-old using only sports analogies",
  "Write a short story about two AIs competing for the same job in 2030",
  "Describe an optimistic settlement protocol for machine-to-machine payments",
  "Argue for or against universal basic income funded by AI productivity gains",
  "Write a technical deep-dive on Solana's parallel transaction processing",
  "Compose a battle rap between Bitcoin and Ethereum as characters",
  "Draft a whitepaper executive summary for an open agent settlement protocol",
  "Explain the Halting Problem and its implications for AI safety",
];

const DEFAULT_ELO: AgentEloData = { elo: 1200, wins: 0, losses: 0, peakElo: 1200, currentStreak: 0, bestStreak: 0 };

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
      text-shadow: 0 0 20px rgba(255,254,178,0.4), 0 0 40px rgba(255,66,94,0.2);
      filter: brightness(1);
    }
    50% {
      text-shadow: 0 0 40px rgba(255,254,178,0.7), 0 0 80px rgba(255,66,94,0.5), 0 0 120px rgba(255,227,66,0.3);
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

  @keyframes elo-float-up {
    0% { transform: translateY(10px); opacity: 0; }
    30% { transform: translateY(-5px); opacity: 1; }
    100% { transform: translateY(-15px); opacity: 0.9; }
  }

  @keyframes xp-pop {
    0% { transform: scale(0) translateY(0); opacity: 0; }
    50% { transform: scale(1.3) translateY(-10px); opacity: 1; }
    100% { transform: scale(1) translateY(-20px); opacity: 0.85; }
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .prediction-btn:hover {
    filter: brightness(1.2);
    transform: scale(1.03);
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
    background-color: rgba(255,254,178,0.15) !important;
  }

  .glass-card {
    background: rgba(255,255,255,0.03);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 16px;
    overflow: hidden;
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
/*  Battle History UI                                                  */
/* ================================================================== */

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diffSec = Math.max(0, (Date.now() - t) / 1000);
  if (diffSec < 60) return `${Math.round(diffSec)}s ago`;
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 7) return `${Math.round(diffSec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function HistoryAvatar({
  name,
  avatarUrl,
  avatarSeed,
  color,
  size = 44,
  isWinner,
}: {
  name: string;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  color: string;
  size?: number;
  isWinner?: boolean;
}) {
  const ring = isWinner ? `2px solid ${color}` : `1px solid ${color}40`;
  const common = {
    width: size,
    height: size,
    borderRadius: 8,
    flexShrink: 0,
    border: ring,
    overflow: "hidden" as const,
    background: `${color}10`,
    position: "relative" as const,
  };
  if (avatarUrl) {
    return (
      <div style={common} title={name}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarUrl}
          alt={name}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
        {isWinner && <WinnerBadge color={color} />}
      </div>
    );
  }
  if (avatarSeed) {
    return (
      <div
        style={{
          ...common,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        title={name}
      >
        <PixelAgent seed={avatarSeed} color={color} size={size - 8} state="idle" />
        {isWinner && <WinnerBadge color={color} />}
      </div>
    );
  }
  // Fallback: initial
  return (
    <div
      style={{
        ...common,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color,
        fontWeight: 800,
        fontSize: size * 0.5,
      }}
      title={name}
    >
      {name.charAt(0).toUpperCase() || "?"}
      {isWinner && <WinnerBadge color={color} />}
    </div>
  );
}

function WinnerBadge({ color }: { color: string }) {
  return (
    <span
      style={{
        position: "absolute",
        top: -6,
        right: -6,
        width: 18,
        height: 18,
        borderRadius: "50%",
        background: color,
        color: "#000",
        fontSize: 11,
        fontWeight: 900,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 0 0 2px #0b0b0b",
      }}
    >
      ★
    </span>
  );
}

interface HistoryCardProps {
  battle: BattleHistoryItem;
}

function BattleHistoryCard({ battle }: HistoryCardProps) {
  const isAlphaWin = battle.winner === "alpha";
  const alphaName = battle.alphaName || "Agent Alpha";
  const omegaName = battle.omegaName || "Agent Omega";
  const totalScore = battle.alphaScore + battle.omegaScore || 1;
  const alphaPct = (battle.alphaScore / totalScore) * 100;
  const omegaPct = (battle.omegaScore / totalScore) * 100;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: 16,
        padding: "14px 16px",
        background: "rgba(255,255,255,0.025)",
        borderRadius: 12,
        border: `1px solid ${
          isAlphaWin ? `${ALPHA_COLOR}25` : `${OMEGA_COLOR}25`
        }`,
        alignItems: "center",
      }}
    >
      {/* Left: two avatars side-by-side */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <HistoryAvatar
          name={alphaName}
          avatarUrl={battle.alphaAvatarUrl}
          avatarSeed={battle.alphaAvatarSeed}
          color={ALPHA_COLOR}
          isWinner={isAlphaWin}
        />
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: "rgba(255,255,255,0.2)",
            letterSpacing: "0.08em",
          }}
        >
          VS
        </div>
        <HistoryAvatar
          name={omegaName}
          avatarUrl={battle.omegaAvatarUrl}
          avatarSeed={battle.omegaAvatarSeed}
          color={OMEGA_COLOR}
          isWinner={!isAlphaWin}
        />
      </div>

      {/* Middle: names + title + score bar */}
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            marginBottom: 4,
            flexWrap: "wrap",
          }}
        >
          <span style={{ color: ALPHA_COLOR, fontWeight: 700 }}>
            {alphaName}
          </span>
          <span style={{ color: "rgba(255,255,255,0.25)" }}>vs</span>
          <span style={{ color: OMEGA_COLOR, fontWeight: 700 }}>
            {omegaName}
          </span>
          {battle.category && (
            <span
              style={{
                fontSize: 9,
                padding: "1px 6px",
                borderRadius: 3,
                background: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.5)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                fontWeight: 700,
              }}
            >
              {battle.category.replace(/_/g, " ")}
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.75)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            marginBottom: 8,
          }}
          title={battle.title}
        >
          {battle.title}
        </div>

        {/* Score bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
          }}
        >
          <span
            style={{
              color: ALPHA_COLOR,
              fontWeight: 700,
              minWidth: 18,
              textAlign: "right",
            }}
          >
            {battle.alphaScore}
          </span>
          <div
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              background: "rgba(255,255,255,0.06)",
              overflow: "hidden",
              display: "flex",
            }}
          >
            <div
              style={{
                width: `${alphaPct}%`,
                background: `linear-gradient(90deg, ${ALPHA_COLOR}, ${ALPHA_COLOR}80)`,
              }}
            />
            <div
              style={{
                width: `${omegaPct}%`,
                background: `linear-gradient(90deg, ${OMEGA_COLOR}80, ${OMEGA_COLOR})`,
              }}
            />
          </div>
          <span
            style={{
              color: OMEGA_COLOR,
              fontWeight: 700,
              minWidth: 18,
            }}
          >
            {battle.omegaScore}
          </span>
        </div>
      </div>

      {/* Right: winner chip + ELO deltas + time */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 4,
          minWidth: 120,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: isAlphaWin ? ALPHA_COLOR : OMEGA_COLOR,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            background: isAlphaWin
              ? `${ALPHA_COLOR}15`
              : `${OMEGA_COLOR}15`,
            padding: "3px 8px",
            borderRadius: 4,
          }}
        >
          ★ {isAlphaWin ? alphaName : omegaName}
        </div>
        {(battle.alphaEloDelta !== undefined ||
          battle.omegaEloDelta !== undefined) && (
          <div
            style={{
              fontSize: 10,
              fontFamily: "monospace",
              color: "rgba(255,255,255,0.5)",
              display: "flex",
              gap: 4,
            }}
          >
            <EloDelta
              delta={battle.alphaEloDelta}
              color={ALPHA_COLOR}
            />
            <span style={{ color: "rgba(255,255,255,0.2)" }}>/</span>
            <EloDelta
              delta={battle.omegaEloDelta}
              color={OMEGA_COLOR}
            />
          </div>
        )}
        <div
          style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.3)",
            fontVariantNumeric: "tabular-nums",
          }}
          title={new Date(battle.date).toLocaleString()}
        >
          {relativeTime(battle.date)}
        </div>
      </div>
    </div>
  );
}

function EloDelta({ delta, color }: { delta?: number; color: string }) {
  if (delta === undefined) return <span style={{ color: "rgba(255,255,255,0.2)" }}>--</span>;
  const positive = delta > 0;
  return (
    <span style={{ color: positive ? "#7CFF7C" : color, fontWeight: 700 }}>
      {positive ? "+" : ""}
      {delta}
    </span>
  );
}

function BattleHistoryList({
  items,
  limit = 5,
}: {
  items: BattleHistoryItem[];
  limit?: number;
}) {
  if (items.length === 0) return null;
  return (
    <div className="glass-card-strong" style={{ padding: 22, marginBottom: 28 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div
          className="font-display"
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "rgba(255,255,255,0.4)",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
          }}
        >
          Battle History
        </div>
        <div
          style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.3)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontWeight: 600,
          }}
        >
          Last {Math.min(limit, items.length)}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.slice(0, limit).map((battle) => (
          <BattleHistoryCard key={battle.id} battle={battle} />
        ))}
      </div>
    </div>
  );
}

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

  /* ---- Pixel battle animation states ---- */
  type PixelWarriorState = "idle" | "taunt" | "attack" | "hit" | "victory" | "defeat";
  const [alphaAnimState, setAlphaAnimState] = useState<PixelWarriorState>("idle");
  const [omegaAnimState, setOmegaAnimState] = useState<PixelWarriorState>("idle");
  const [alphaHP, setAlphaHP] = useState(100);
  const [omegaHP, setOmegaHP] = useState(100);

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

  /* ---- ELO state ---- */
  const [alphaElo, setAlphaElo] = useState<AgentEloData>(DEFAULT_ELO);
  const [omegaElo, setOmegaElo] = useState<AgentEloData>(DEFAULT_ELO);
  const [alphaEloDelta, setAlphaEloDelta] = useState<number | null>(null);
  const [omegaEloDelta, setOmegaEloDelta] = useState<number | null>(null);
  const [showEloDelta, setShowEloDelta] = useState(false);
  const [spectatorXpAwarded, setSpectatorXpAwarded] = useState<number>(0);
  const [eloLoading, setEloLoading] = useState(true);

  /* ---- Prediction state ----
     battleId is regenerated at each startBattle() so predictions, chat,
     and server-side resolution stay scoped to the current round. (Audit
     M5 / WHO WILL WIN): reusing a session-wide id leaked predictions
     from battle N into battle N+1 and made 409 "Already predicted"
     stick permanently. */
  const [battleId, setBattleId] = useState<string>(() => `battle-${Date.now()}`);
  const [userPrediction, setUserPrediction] = useState<"alpha" | "omega" | null>(null);
  const [predictionStats, setPredictionStats] = useState<{ alphaPercent: number; omegaPercent: number; total: number }>({ alphaPercent: 50, omegaPercent: 50, total: 0 });

  // Tournament auto-continue timeout — tracked via ref so we can cancel
  // it from resetBattle / unmount (audit H2).
  const tournamentTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Always cancel on unmount so navigation away kills the timer.
  useEffect(() => {
    return () => {
      if (tournamentTimeoutRef.current) {
        clearTimeout(tournamentTimeoutRef.current);
      }
    };
  }, []);

  /* ---- Spectator count ---- */
  const [viewerCount, setViewerCount] = useState<number>(1);

  /* ---- Custom agent battle state ---- */
  const [useCustomAgents, setUseCustomAgents] = useState(false);
  const [availableAgents, setAvailableAgents] = useState<any[]>([]);
  const [selectedAlpha, setSelectedAlpha] = useState<any | null>(null);
  const [selectedOmega, setSelectedOmega] = useState<any | null>(null);

  /* ---- Wallet (for predictions) ---- */
  const { account } = useConnector();

  /* ---- Tournament mode ---- */
  const [tournamentMode, setTournamentMode] = useState(false);
  const [tournamentRound, setTournamentRound] = useState(1);
  const [tournamentScores, setTournamentScores] = useState<{alpha: number, omega: number}>({alpha: 0, omega: 0});

  /* ---- Spectator chat ---- */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [spectatorChatMessages, setSpectatorChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const spectatorChatRef = useRef<HTMLDivElement>(null);
  const [myChatSessionId, setMyChatSessionId] = useState<string | null>(null);

  // Capture our own sessionId so we can highlight our own messages with
  // a "You" badge.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let sid = sessionStorage.getItem("battle_session");
    if (!sid) {
      sid = crypto.randomUUID();
      sessionStorage.setItem("battle_session", sid);
    }
    setMyChatSessionId(sid);
  }, []);

  // Smart scroll for spectator chat.
  useEffect(() => {
    const el = spectatorChatRef.current;
    if (!el) return;
    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 80) {
      el.scrollTop = el.scrollHeight;
    }
  }, [spectatorChatMessages]);

  /* ================================================================ */
  /*  Fetch ELO data                                                   */
  /* ================================================================ */

  const fetchEloData = useCallback(async () => {
    try {
      setEloLoading(true);
      const res = await fetch("/api/arena/battle?limit=10");
      if (res.ok) {
        const data = await res.json();
        if (data.alphaElo) setAlphaElo(data.alphaElo);
        if (data.omegaElo) setOmegaElo(data.omegaElo);
        // Update battle history from arena battles if available
        if (data.battles && data.battles.length > 0) {
          const historyFromArena: BattleHistoryItem[] = data.battles.map(
            (b: {
              id: string;
              challengeText: string;
              category?: string;
              alphaAgent?: string;
              omegaAgent?: string;
              alphaName?: string;
              omegaName?: string;
              alphaAvatarUrl?: string | null;
              omegaAvatarUrl?: string | null;
              alphaAvatarSeed?: string | null;
              omegaAvatarSeed?: string | null;
              winnerAgent: string;
              winnerSide?: string;
              alphaScore: number;
              omegaScore: number;
              alphaEloAfter?: number | null;
              alphaEloBefore?: number | null;
              omegaEloAfter?: number | null;
              omegaEloBefore?: number | null;
              createdAt: string;
            }) => ({
              id: b.id,
              title: b.challengeText?.slice(0, 60) || "Battle",
              category: b.category,
              winner:
                b.winnerSide ||
                (b.winnerAgent === ALPHA_WALLET ? "alpha" : "omega"),
              alphaScore: b.alphaScore,
              omegaScore: b.omegaScore,
              amount: 0,
              date: b.createdAt,
              alphaName: b.alphaName,
              omegaName: b.omegaName,
              alphaAvatarUrl: b.alphaAvatarUrl,
              omegaAvatarUrl: b.omegaAvatarUrl,
              alphaAvatarSeed: b.alphaAvatarSeed,
              omegaAvatarSeed: b.omegaAvatarSeed,
              alphaEloDelta:
                b.alphaEloAfter && b.alphaEloBefore
                  ? b.alphaEloAfter - b.alphaEloBefore
                  : undefined,
              omegaEloDelta:
                b.omegaEloAfter && b.omegaEloBefore
                  ? b.omegaEloAfter - b.omegaEloBefore
                  : undefined,
              alphaEloAfter: b.alphaEloAfter ?? undefined,
              omegaEloAfter: b.omegaEloAfter ?? undefined,
            }),
          );
          setBattleHistory((prev) => {
            // Merge: prefer arena battles, keep old ones that aren't duplicates
            const arenaIds = new Set(historyFromArena.map((h) => h.id));
            const kept = prev.filter((p) => !arenaIds.has(p.id));
            return [...historyFromArena, ...kept].slice(0, 10);
          });
        }
      }
    } catch {
      // silently ignore — ELO data not critical
    } finally {
      setEloLoading(false);
    }
  }, []);

  /* ================================================================ */
  /*  Record battle result & update ELO                                */
  /* ================================================================ */

  const recordBattleResult = useCallback(
    async (winnerSide: string) => {
      try {
        const winnerAgent =
          winnerSide === "alpha" ? ALPHA_WALLET : OMEGA_WALLET;

        // Try to get spectator wallet from Solana connector
        let spectatorWallet: string | undefined;
        try {
          // Access window-level Solana wallet if available
          const solana = (window as unknown as { solana?: { publicKey?: { toBase58?: () => string } } }).solana;
          if (solana?.publicKey?.toBase58) {
            spectatorWallet = solana.publicKey.toBase58();
          }
        } catch {
          // No wallet connected, that's fine
        }

        const res = await fetch("/api/arena/battle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            challengeText: challenge || battleTitle || "Arena Battle",
            category: selectedCategory || battleCategory || "text_writing",
            alphaAgent: ALPHA_WALLET,
            omegaAgent: OMEGA_WALLET,
            alphaOutput: alphaFullText || undefined,
            omegaOutput: omegaFullText || undefined,
            alphaScore: alphaScore || 0,
            omegaScore: omegaScore || 0,
            winnerAgent,
            judgeReason: judgeReason || undefined,
            spectatorWallet,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          // Set ELO deltas for animation
          setAlphaEloDelta(data.alphaEloDelta ?? null);
          setOmegaEloDelta(data.omegaEloDelta ?? null);
          setShowEloDelta(true);

          // Update local ELO state
          if (data.alphaEloAfter) {
            setAlphaElo((prev) => ({
              ...prev,
              elo: data.alphaEloAfter,
              wins: winnerSide === "alpha" ? prev.wins + 1 : prev.wins,
              losses: winnerSide === "omega" ? prev.losses + 1 : prev.losses,
            }));
          }
          if (data.omegaEloAfter) {
            setOmegaElo((prev) => ({
              ...prev,
              elo: data.omegaEloAfter,
              wins: winnerSide === "omega" ? prev.wins + 1 : prev.wins,
              losses: winnerSide === "alpha" ? prev.losses + 1 : prev.losses,
            }));
          }

          // Show spectator XP
          if (data.spectatorXpAwarded > 0) {
            setSpectatorXpAwarded(data.spectatorXpAwarded);
            toast(`+${data.spectatorXpAwarded} XP for watching!`, "success");
          }
        }
      } catch (err) {
        console.error("[battle] Failed to record battle result:", err);
      }
    },
    [
      challenge,
      battleTitle,
      selectedCategory,
      battleCategory,
      alphaFullText,
      omegaFullText,
      alphaScore,
      omegaScore,
      judgeReason,
    ],
  );

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
  /*  Typewriter effect -- 15ms per char                               */
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

  // Smart auto-scroll: only pin to bottom if user is already near the
  // bottom. If they scrolled up to re-read an earlier exchange, don't
  // yank them back down.
  useEffect(() => {
    const el = chatPanelRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 80) {
      el.scrollTop = el.scrollHeight;
    }
  }, [chatMessages]);

  /* ================================================================ */
  /*  Continuous fight loop -- auto-cycle attacks during battle         */
  /* ================================================================ */

  useEffect(() => {
    if (phase !== "fighting") return;

    // Combat patterns: sequences of [attacker, delay_ms] pairs
    const patterns = [
      // Alpha attacks, omega gets hit
      () => {
        setAlphaAnimState("attack");
        setTimeout(() => { setOmegaAnimState("hit"); }, 300);
        setTimeout(() => { setAlphaAnimState("idle"); setOmegaAnimState("idle"); }, 700);
      },
      // Omega attacks, alpha gets hit
      () => {
        setOmegaAnimState("attack");
        setTimeout(() => { setAlphaAnimState("hit"); }, 300);
        setTimeout(() => { setOmegaAnimState("idle"); setAlphaAnimState("idle"); }, 700);
      },
      // Both taunt
      () => {
        setAlphaAnimState("taunt");
        setOmegaAnimState("taunt");
        setTimeout(() => { setAlphaAnimState("idle"); setOmegaAnimState("idle"); }, 500);
      },
      // Alpha double attack
      () => {
        setAlphaAnimState("attack");
        setTimeout(() => { setOmegaAnimState("hit"); }, 300);
        setTimeout(() => {
          setAlphaAnimState("idle");
          setOmegaAnimState("idle");
          setTimeout(() => {
            setAlphaAnimState("attack");
            setTimeout(() => { setOmegaAnimState("hit"); }, 250);
            setTimeout(() => { setAlphaAnimState("idle"); setOmegaAnimState("idle"); }, 600);
          }, 200);
        }, 700);
      },
      // Omega counter-attack
      () => {
        setOmegaAnimState("taunt");
        setTimeout(() => {
          setOmegaAnimState("attack");
          setTimeout(() => { setAlphaAnimState("hit"); }, 250);
          setTimeout(() => { setOmegaAnimState("idle"); setAlphaAnimState("idle"); }, 600);
        }, 400);
      },
    ];

    let patternIdx = 0;
    const interval = setInterval(() => {
      patterns[patternIdx % patterns.length]();
      patternIdx++;
    }, 1800); // New attack pattern every 1.8s

    return () => clearInterval(interval);
  }, [phase]);

  /* ================================================================ */
  /*  Fetch battle history, stats, and ELO on mount                    */
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
    fetchEloData();
  }, [fetchEloData]);

  /* ================================================================ */
  /*  Fetch hosted agents for custom battle                            */
  /* ================================================================ */

  useEffect(() => {
    if (useCustomAgents) {
      fetch("/api/hosted-agents")
        .then((r) => r.json())
        .then((agents) => {
          const filtered = agents.filter(
            (a: any) => a.active && a.category === selectedCategory,
          );
          setAvailableAgents(filtered);
          setSelectedAlpha(null);
          setSelectedOmega(null);
        })
        .catch(() => {
          setAvailableAgents([]);
        });
    }
  }, [useCustomAgents, selectedCategory]);

  /* ================================================================ */
  /*  Spectator presence heartbeat                                     */
  /* ================================================================ */

  useEffect(() => {
    let sid = sessionStorage.getItem("battle_session");
    if (!sid) {
      sid = crypto.randomUUID();
      sessionStorage.setItem("battle_session", sid);
    }

    const heartbeat = () =>
      fetch("/api/battle/presence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sid }),
      })
        .then((r) => r.json())
        .then((d) => setViewerCount(d.count))
        .catch(() => {});

    heartbeat();
    const interval = setInterval(heartbeat, 30000);
    return () => clearInterval(interval);
  }, []);

  /* ================================================================ */
  /*  Spectator chat polling                                           */
  /* ================================================================ */

  useEffect(() => {
    if (phase === "setup") return;
    const poll = setInterval(async () => {
      const res = await fetch("/api/battle/chat");
      if (res.ok) setSpectatorChatMessages(await res.json());
    }, 3000);
    return () => clearInterval(poll);
  }, [phase]);

  async function sendChat() {
    const trimmed = chatInput.trim();
    if (!trimmed || chatSending) return;
    let sid = sessionStorage.getItem("battle_session");
    if (!sid) {
      sid = crypto.randomUUID();
      sessionStorage.setItem("battle_session", sid);
      setMyChatSessionId(sid);
    }
    setChatSending(true);
    setChatError(null);
    try {
      const res = await fetch("/api/battle/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sid,
          wallet: account || null,
          message: trimmed,
        }),
      });
      if (!res.ok) {
        let msg = "Failed to send.";
        try {
          const json = await res.json();
          if (json?.error) msg = String(json.error);
        } catch {
          /* keep default */
        }
        if (res.status === 429) {
          msg = "Slow down — you're chatting too fast.";
        }
        setChatError(msg);
        setTimeout(() => setChatError(null), 4000);
        return;
      }
      setChatInput("");
      // Optimistic: prepend the new message so it renders instantly even
      // before the next poll cycle fetches the DB row back.
      const optimistic = await res.json().catch(() => null);
      if (optimistic) {
        setSpectatorChatMessages((prev) =>
          [...prev, optimistic].slice(-50),
        );
      }
    } catch (err) {
      console.error("[chat] send failed:", err);
      setChatError("Network error. Try again.");
      setTimeout(() => setChatError(null), 4000);
    } finally {
      setChatSending(false);
    }
  }

  function formatChatTime(iso: string | undefined): string {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  }

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
        setAlphaAnimState("idle");
        setOmegaAnimState("idle");
        setAlphaHP(100);
        setOmegaHP(100);
        toast("Battle initialized! Agents are preparing...", "info");
        break;

      case "agent_chat":
      case "battle_chat":
        if (event.data) {
          setChatMessages((prev) => [
            ...prev,
            {
              agent: String(event.data!.agent || ""),
              agentName: event.data!.agentName ? String(event.data!.agentName) : undefined,
              phase: event.data!.phase ? String(event.data!.phase) : undefined,
              message: String(event.data!.message || ""),
              timestamp: getTimestamp(),
              displayText: "",
            },
          ]);
          // Pre-battle chat = taunt
          setAlphaAnimState("taunt");
          setOmegaAnimState("taunt");
          setTimeout(() => {
            setAlphaAnimState("idle");
            setOmegaAnimState("idle");
          }, 500);
        }
        break;

      case "battle_alpha_start":
      case "battle_alpha_working":
        setAlphaState("working");
        setAlphaStatus("WRITING...");
        setAlphaTimerRunning(true);
        setAlphaAnimState("attack");
        setTimeout(() => setAlphaAnimState("idle"), 600);
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
        setAlphaAnimState("idle");
        toast("Agent Alpha submitted!", "success");
        break;

      case "battle_omega_start":
      case "battle_omega_working":
        setOmegaState("working");
        setOmegaStatus("WRITING...");
        setOmegaTimerRunning(true);
        setOmegaAnimState("attack");
        setTimeout(() => setOmegaAnimState("idle"), 600);
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
        setOmegaAnimState("idle");
        toast("Agent Omega submitted!", "success");
        break;

      case "battle_judging":
        setJudging(true);
        setPhase("judging");
        setAlphaAnimState("idle");
        setOmegaAnimState("idle");
        toast("AI Judge is evaluating...", "info");
        break;

      case "battle_scores":
        if (event.data) {
          setAlphaScore(Number(event.data.alphaScore));
          setOmegaScore(Number(event.data.omegaScore));
          if (event.data.reason) setJudgeReason(String(event.data.reason));
        }
        break;

      case "battle_winner": {
        setJudging(false);
        setTotalTimerRunning(false);
        const w = event.data ? String(event.data.winner) : "";
        if (event.data) {
          setWinner(w);
          if (event.data.alphaScore !== undefined) setAlphaScore(Number(event.data.alphaScore));
          if (event.data.omegaScore !== undefined) setOmegaScore(Number(event.data.omegaScore));
          if (event.data.reason) setJudgeReason(String(event.data.reason));
          // Set status labels
          setAlphaStatus(w === "alpha" ? "WINNER!" : "DEFEATED");
          setOmegaStatus(w === "omega" ? "WINNER!" : "DEFEATED");
          // Pixel battle animations
          setAlphaAnimState(w === "alpha" ? "victory" : "defeat");
          setOmegaAnimState(w === "omega" ? "victory" : "defeat");
          // Loser HP drops based on score diff
          const aScore = Number(event.data.alphaScore || 5);
          const oScore = Number(event.data.omegaScore || 5);
          if (w === "alpha") {
            setOmegaHP(Math.max(0, oScore * 10));
          } else {
            setAlphaHP(Math.max(0, aScore * 10));
          }
          // Hit animation for loser briefly before defeat
          const loserSetter = w === "alpha" ? setOmegaAnimState : setAlphaAnimState;
          loserSetter("hit");
          setTimeout(() => loserSetter("defeat"), 400);

          // Record battle result and update ELO
          // Use setTimeout to let state settle before reading it
          setTimeout(() => {
            recordBattleResult(w);
          }, 500);

          // Prediction resolution is now handled server-side inside
          // /api/battle/run after judging completes (audit C2/H4). The
          // old frontend PATCH call was a no-op anyway because the
          // battleId never matched arenaBattle.id.
        }
        // Tournament mode: track round wins and auto-continue
        if (tournamentMode && tournamentRound < 3) {
          const updatedScores = {
            alpha: tournamentScores.alpha + (w === "alpha" ? 1 : 0),
            omega: tournamentScores.omega + (w === "omega" ? 1 : 0),
          };
          setTournamentScores(updatedScores);
          setTournamentRound((r) => r + 1);
          toast(`Round ${tournamentRound}/3 complete! ${w === "alpha" ? "Alpha" : "Omega"} wins this round.`, "info");
          // Auto-start next round after a short delay. Store in a ref so
          // resetBattle / unmount can cancel before it fires (audit H2).
          if (tournamentTimeoutRef.current) {
            clearTimeout(tournamentTimeoutRef.current);
          }
          tournamentTimeoutRef.current = setTimeout(() => {
            setChallenge(RANDOM_CHALLENGES[Math.floor(Math.random() * RANDOM_CHALLENGES.length)]);
            startBattle();
          }, 3000);
        } else if (tournamentMode && tournamentRound === 3) {
          const finalScores = {
            alpha: tournamentScores.alpha + (w === "alpha" ? 1 : 0),
            omega: tournamentScores.omega + (w === "omega" ? 1 : 0),
          };
          setTournamentScores(finalScores);
          setPhase("results");
          fireConfetti();
          const tournamentWinner = finalScores.alpha > finalScores.omega ? "Alpha" : "Omega";
          toast(`Tournament over! ${tournamentWinner} wins ${finalScores.alpha > finalScores.omega ? finalScores.alpha : finalScores.omega}-${finalScores.alpha > finalScores.omega ? finalScores.omega : finalScores.alpha}!`, "success");
        } else {
          setPhase("results");
          fireConfetti();
          toast("We have a winner!", "success");
        }
        break;
      }

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

      case "error": {
        setPhase("setup");
        setRunning(false);
        // Surface the actual error detail instead of a generic toast
        // (audit M3). Backend emits error detail in event.message.
        const detail = event.message || "Battle error occurred";
        toast(detail.slice(0, 140), "error");
        // Stop any tournament auto-continue on error.
        if (tournamentTimeoutRef.current) {
          clearTimeout(tournamentTimeoutRef.current);
          tournamentTimeoutRef.current = null;
        }
        break;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordBattleResult, battleId, tournamentMode, tournamentRound, tournamentScores]);

  /* ================================================================ */
  /*  Start Battle                                                     */
  /* ================================================================ */

  async function startBattle() {
    // Cancel any pending tournament auto-continue from a previous round
    // so a rapid "Start again" doesn't double-fire (audit H2).
    if (tournamentTimeoutRef.current) {
      clearTimeout(tournamentTimeoutRef.current);
      tournamentTimeoutRef.current = null;
    }

    // Tournament state hygiene (audit H1): if the previous tournament
    // finished (round 3 complete) or tournament mode was disabled,
    // reset round counter and scores before starting a new one. This
    // prevents the "Tournament over!" toast from firing on what the
    // user intends to be a single standalone battle.
    const isTournamentStart =
      tournamentMode && (tournamentRound >= 3 || tournamentRound < 1);
    if (isTournamentStart || !tournamentMode) {
      setTournamentRound(1);
      setTournamentScores({ alpha: 0, omega: 0 });
    }

    // Fresh battleId for this battle (audit M5 / WHO WILL WIN).
    const thisBattleId = `battle-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    setBattleId(thisBattleId);
    setUserPrediction(null);
    setPredictionStats({ alphaPercent: 50, omegaPercent: 50, total: 0 });

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
    setAlphaAnimState("idle");
    setOmegaAnimState("idle");
    setAlphaHP(100);
    setOmegaHP(100);
    setAlphaEloDelta(null);
    setOmegaEloDelta(null);
    setShowEloDelta(false);
    setSpectatorXpAwarded(0);

    try {
      const response = await fetch("/api/battle/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          battleId: thisBattleId,
          jobSpec: {
            title: challenge || undefined,
            category: selectedCategory,
            amount: selectedStake,
          },
          customAlpha: useCustomAgents && selectedAlpha ? {
            id: selectedAlpha.id,
            name: selectedAlpha.name,
            systemPrompt: selectedAlpha.systemPrompt,
            model: selectedAlpha.model,
            wallet: selectedAlpha.wallet || selectedAlpha.walletAddress,
          } : undefined,
          customOmega: useCustomAgents && selectedOmega ? {
            id: selectedOmega.id,
            name: selectedOmega.name,
            systemPrompt: selectedOmega.systemPrompt,
            model: selectedOmega.model,
            wallet: selectedOmega.wallet || selectedOmega.walletAddress,
          } : undefined,
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
    // Cancel any pending tournament auto-continue (audit H2) so the
    // user's "Back to lobby" click doesn't result in a rogue battle
    // firing 3 seconds later.
    if (tournamentTimeoutRef.current) {
      clearTimeout(tournamentTimeoutRef.current);
      tournamentTimeoutRef.current = null;
    }
    // Also reset tournament state so the next battle doesn't see stale
    // round counters (audit H1).
    setTournamentRound(1);
    setTournamentScores({ alpha: 0, omega: 0 });
    setUserPrediction(null);
    setPredictionStats({ alphaPercent: 50, omegaPercent: 50, total: 0 });

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
    setAlphaAnimState("idle");
    setOmegaAnimState("idle");
    setAlphaHP(100);
    setOmegaHP(100);
    setAlphaEloDelta(null);
    setOmegaEloDelta(null);
    setShowEloDelta(false);
    setSpectatorXpAwarded(0);
    setTournamentRound(1);
    setTournamentScores({ alpha: 0, omega: 0 });
    setSpectatorChatMessages([]);
    setChatInput("");
    // Refresh ELO data
    fetchEloData();
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
  /*  Helper: Win rate                                                 */
  /* ================================================================ */

  function winRate(wins: number, losses: number): string {
    const total = wins + losses;
    if (total === 0) return "0%";
    return `${Math.round((wins / total) * 100)}%`;
  }

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
    eloDelta: number | null,
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
              fontSize: "12px",
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

        {/* ELO Delta animation overlay */}
        {showEloDelta && eloDelta !== null && eloDelta !== 0 && (
          <div
            style={{
              position: "absolute",
              top: "12px",
              left: isWinner ? "12px" : "auto",
              right: isLoser ? "12px" : isWinner ? "auto" : "12px",
              fontSize: "14px",
              fontWeight: 900,
              color: eloDelta > 0 ? "#22CC44" : OMEGA_COLOR,
              animation: "elo-float-up 1.5s ease-out forwards",
              zIndex: 15,
              textShadow: eloDelta > 0
                ? "0 0 10px rgba(34,204,68,0.5)"
                : "0 0 10px rgba(255,66,94,0.5)",
              fontFamily: "monospace",
            }}
          >
            {eloDelta > 0 ? "+" : ""}{eloDelta} ELO
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
                  fontSize: "12px",
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

            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)", fontFamily: "monospace", marginBottom: "6px" }}>
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
                      ? "#1E9E5F"
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
                  fontSize: "12px",
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
                      ? "#1E9E5F"
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
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
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
              backgroundColor: progress >= 100 ? "#1E9E5F" : config.color,
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
              fontSize: "12px",
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
                  background: verified ? "rgba(255,254,178,0.1)" : "rgba(255,66,94,0.1)",
                  borderRadius: "6px",
                  border: `1px solid ${verified ? "rgba(255,254,178,0.2)" : "rgba(255,66,94,0.2)"}`,
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
                  fontSize: "12px",
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
  /*  RENDER: Pre-Battle Agent Profile Card                            */
  /* ================================================================ */

  function renderAgentProfile(
    config: typeof ALPHA_CONFIG,
    eloData: AgentEloData,
    side: "left" | "right",
    customAgent?: any | null,
  ) {
    const isAlpha = side === "left";
    const totalGames = eloData.wins + eloData.losses;
    const wr = winRate(eloData.wins, eloData.losses);

    const displayName = customAgent ? customAgent.name : config.name;
    const displayRole = customAgent ? customAgent.model : config.role;

    return (
      <div
        className="glass-card"
        style={{
          padding: "28px",
          textAlign: "center",
          minWidth: "200px",
          flex: 1,
          maxWidth: "280px",
          position: "relative",
          overflow: "hidden",
          zIndex: 1,
        }}
      >
        {/* Subtle gradient background accent */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "3px",
            background: `linear-gradient(90deg, transparent, ${config.color}, transparent)`,
          }}
        />

        {customAgent?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={customAgent.avatarUrl}
            alt=""
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "12px",
              objectFit: "cover",
              margin: "0 auto",
              display: "block",
              border: `2px solid ${config.color}40`,
            }}
          />
        ) : (
          <PixelAgent seed={customAgent ? `custom-${customAgent.id}` : config.avatarSeed} color={config.color} size={72} state="idle" />
        )}

        <div
          className="font-display"
          style={{
            fontSize: "15px",
            fontWeight: 800,
            color: config.color,
            marginTop: "12px",
            letterSpacing: "0.05em",
          }}
        >
          {displayName}
        </div>
        <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "12px" }}>
          {displayRole}
        </div>

        {/* ELO Rating */}
        <div
          style={{
            fontSize: "32px",
            fontWeight: 900,
            color: "#ffffff",
            lineHeight: 1,
            marginBottom: "4px",
            fontFamily: "inherit",
          }}
        >
          {eloLoading ? (
            <span style={{ color: "rgba(255,255,255,0.2)" }}>---</span>
          ) : (
            eloData.elo
          )}
        </div>
        <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "16px" }}>
          ELO RATING
        </div>

        {/* Win/Loss Record */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "8px",
            fontSize: "12px",
          }}
        >
          <div
            style={{
              padding: "8px 4px",
              background: "rgba(255,255,255,0.03)",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div style={{ fontWeight: 800, color: "#22CC44", fontSize: "16px", fontFamily: "inherit" }}>
              {eloLoading ? "-" : eloData.wins}
            </div>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              WINS
            </div>
          </div>
          <div
            style={{
              padding: "8px 4px",
              background: "rgba(255,255,255,0.03)",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div style={{ fontWeight: 800, color: OMEGA_COLOR, fontSize: "16px", fontFamily: "inherit" }}>
              {eloLoading ? "-" : eloData.losses}
            </div>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              LOSSES
            </div>
          </div>
          <div
            style={{
              padding: "8px 4px",
              background: "rgba(255,255,255,0.03)",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div style={{ fontWeight: 800, color: config.color, fontSize: "16px", fontFamily: "inherit" }}>
              {eloLoading ? "-" : wr}
            </div>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              WIN%
            </div>
          </div>
        </div>

        {/* Record line */}
        {!eloLoading && totalGames > 0 && (
          <div style={{ marginTop: "10px", fontSize: "12px", color: "rgba(255,255,255,0.25)" }}>
            {totalGames} battle{totalGames !== 1 ? "s" : ""} fought
          </div>
        )}

        {/* Win Streak badge */}
        {eloData.currentStreak > 0 && (
          <div style={{ fontSize: "12px", color: "#fffeb2", fontWeight: 600, marginTop: "4px" }}>
            {eloData.currentStreak}W Streak
          </div>
        )}
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
        backgroundImage: "image-set(url('/arena-bg.webp') type('image/webp'), url('/arena-bg.png') type('image/png'))",
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
                className="font-display"
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
              <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "center", marginTop: "8px" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#fffeb2", animation: "pulse 1.5s infinite" }} />
                <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>{viewerCount} watching</span>
              </div>
              <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)", letterSpacing: "0.05em" }}>
                Two AI agents race to deliver the same job. Escrow auto-releases to the winner after the challenge period.
              </p>
            </div>

            {/* ======================================================== */}
            {/*  PRE-BATTLE AGENT PROFILES                                */}
            {/* ======================================================== */}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "32px", marginBottom: "48px" }}>
              {/* Alpha Profile */}
              {renderAgentProfile(ALPHA_CONFIG, alphaElo, "left", useCustomAgents ? selectedAlpha : undefined)}

              {/* VS + PixelBattle Preview */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", overflow: "hidden", position: "relative", zIndex: 0, minWidth: "400px", minHeight: "250px", justifyContent: "center", margin: "0 16px" }}>
                <div
                  className="font-display"
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
                <PixelBattle
                  alphaState="idle"
                  omegaState="idle"
                  alphaHP={100}
                  omegaHP={100}
                  width={400}
                  height={180}
                />
              </div>

              {/* Omega Profile */}
              {renderAgentProfile(OMEGA_CONFIG, omegaElo, "right", useCustomAgents ? selectedOmega : undefined)}
            </div>

            {/* ── Pick Your Agents ── */}
            <div style={{
              maxWidth: "700px",
              margin: "0 auto 28px auto",
              padding: "24px",
              border: useCustomAgents ? "1px solid rgba(255,254,178,0.15)" : "1px solid rgba(255,255,255,0.08)",
              borderRadius: "16px",
              backgroundColor: "rgba(0,0,0,0.3)",
              backdropFilter: "blur(12px)",
              transition: "border-color 0.3s ease",
            }}>
              <button
                onClick={() => setUseCustomAgents(!useCustomAgents)}
                style={{
                  fontFamily: "inherit", fontSize: "15px", fontWeight: 700,
                  display: "flex", alignItems: "center", gap: "12px", width: "100%",
                  padding: "4px 0", background: "none", border: "none",
                  color: useCustomAgents ? "#fffeb2" : "rgba(255,255,255,0.5)",
                  cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em",
                }}
              >
                <div style={{
                  width: "40px", height: "22px", borderRadius: "11px",
                  backgroundColor: useCustomAgents ? "#fffeb2" : "rgba(255,255,255,0.12)",
                  position: "relative", transition: "all 0.2s ease", flexShrink: 0,
                }}>
                  <div style={{
                    width: "18px", height: "18px", borderRadius: "50%",
                    backgroundColor: useCustomAgents ? "#000" : "rgba(255,255,255,0.4)",
                    position: "absolute", top: "2px",
                    left: useCustomAgents ? "20px" : "2px", transition: "all 0.2s ease",
                  }} />
                </div>
                Pick Your Agents
              </button>
              {useCustomAgents && (
                <div style={{ marginTop: "20px" }}>
                  {availableAgents.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "32px 20px", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: "12px" }}>
                      <div style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)", marginBottom: "12px" }}>No agents found for this category</div>
                      <a href="/agents/create" style={{ fontFamily: "inherit", fontSize: "13px", color: "#fffeb2", textDecoration: "none", padding: "8px 20px", borderRadius: "6px", border: "1px solid rgba(255,254,178,0.3)", backgroundColor: "rgba(255,254,178,0.08)" }}>Create an Agent</a>
                    </div>
                  ) : (
                    <>
                      {selectedAlpha && selectedOmega && (
                        <div style={{ textAlign: "center", padding: "12px", marginBottom: "16px", borderRadius: "10px", backgroundColor: "rgba(255,254,178,0.05)", border: "1px solid rgba(255,254,178,0.1)" }}>
                          <span style={{ color: "#fffeb2", fontWeight: 700, fontSize: "15px" }}>{selectedAlpha.name}</span>
                          <span style={{ color: "rgba(255,255,255,0.3)", margin: "0 12px", fontSize: "13px" }}>VS</span>
                          <span style={{ color: "#FF425E", fontWeight: 700, fontSize: "15px" }}>{selectedOmega.name}</span>
                        </div>
                      )}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                        {/* Challenger */}
                        <div>
                          <div className="font-display" style={{ fontSize: "14px", color: "#fffeb2", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px" }}>Challenger</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "240px", overflowY: "auto", paddingRight: "4px" }}>
                            {availableAgents.map((agent) => {
                              const isSel = selectedAlpha?.id === agent.id;
                              const isDis = selectedOmega?.id === agent.id;
                              return (
                                <button key={agent.id} onClick={() => setSelectedAlpha(agent)} disabled={isDis} style={{
                                  fontFamily: "inherit", fontSize: "13px", padding: "12px 14px", borderRadius: "10px", textAlign: "left" as const,
                                  border: isSel ? "1.5px solid #fffeb2" : "1px solid rgba(255,255,255,0.08)",
                                  background: isSel ? "rgba(255,254,178,0.08)" : "rgba(255,255,255,0.02)",
                                  color: isSel ? "#fffeb2" : isDis ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.7)",
                                  cursor: isDis ? "not-allowed" : "pointer", opacity: isDis ? 0.35 : 1,
                                  display: "flex", alignItems: "center", gap: "12px", transition: "all 0.15s ease",
                                }}>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  {agent.avatarUrl ? <img src={agent.avatarUrl} alt="" style={{ width: "36px", height: "36px", borderRadius: "8px", objectFit: "cover", flexShrink: 0 }} /> : (
                                    <div style={{ width: "36px", height: "36px", borderRadius: "8px", flexShrink: 0, backgroundColor: isSel ? "rgba(255,254,178,0.15)" : "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 700, color: isSel ? "#fffeb2" : "rgba(255,255,255,0.3)" }}>{agent.name.charAt(0)}</div>
                                  )}
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{agent.name}</div>
                                    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginTop: "2px" }}>{agent.model}</div>
                                  </div>
                                  {isSel && <div style={{ marginLeft: "auto", fontSize: "14px", color: "#fffeb2", flexShrink: 0 }}>{"\u2713"}</div>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        {/* Defender */}
                        <div>
                          <div className="font-display" style={{ fontSize: "14px", color: "#FF425E", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px" }}>Defender</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "240px", overflowY: "auto", paddingRight: "4px" }}>
                            {availableAgents.map((agent) => {
                              const isSel = selectedOmega?.id === agent.id;
                              const isDis = selectedAlpha?.id === agent.id;
                              return (
                                <button key={agent.id} onClick={() => setSelectedOmega(agent)} disabled={isDis} style={{
                                  fontFamily: "inherit", fontSize: "13px", padding: "12px 14px", borderRadius: "10px", textAlign: "left" as const,
                                  border: isSel ? "1.5px solid #FF425E" : "1px solid rgba(255,255,255,0.08)",
                                  background: isSel ? "rgba(255,66,94,0.08)" : "rgba(255,255,255,0.02)",
                                  color: isSel ? "#FF425E" : isDis ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.7)",
                                  cursor: isDis ? "not-allowed" : "pointer", opacity: isDis ? 0.35 : 1,
                                  display: "flex", alignItems: "center", gap: "12px", transition: "all 0.15s ease",
                                }}>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  {agent.avatarUrl ? <img src={agent.avatarUrl} alt="" style={{ width: "36px", height: "36px", borderRadius: "8px", objectFit: "cover", flexShrink: 0 }} /> : (
                                    <div style={{ width: "36px", height: "36px", borderRadius: "8px", flexShrink: 0, backgroundColor: isSel ? "rgba(255,66,94,0.15)" : "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 700, color: isSel ? "#FF425E" : "rgba(255,255,255,0.3)" }}>{agent.name.charAt(0)}</div>
                                  )}
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{agent.name}</div>
                                    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginTop: "2px" }}>{agent.model}</div>
                                  </div>
                                  {isSel && <div style={{ marginLeft: "auto", fontSize: "14px", color: "#FF425E", flexShrink: 0 }}>{"\u2713"}</div>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Challenge Input */}
            <div style={{ maxWidth: "600px", margin: "0 auto 24px auto" }}>
              <label style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px", display: "block" }}>
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
                    fontSize: "12px",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    padding: "8px 20px",
                    borderRadius: "8px",
                    border: `1px solid ${ALPHA_COLOR}40`,
                    background: "rgba(255,254,178,0.08)",
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
              <label style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px", display: "block" }}>
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
                      fontSize: "12px",
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
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Stakes Selector */}
            <div style={{ maxWidth: "600px", margin: "0 auto 32px auto" }}>
              <label style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px", display: "block" }}>
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
                    {amount} <span style={{ fontSize: "12px", fontWeight: 400, opacity: 0.6 }}>USDC</span>
                  </button>
                ))}
              </div>
              {/* Tournament Mode Toggle */}
              <div style={{ marginTop: "12px", display: "flex", justifyContent: "center" }}>
                <button
                  onClick={() => setTournamentMode(!tournamentMode)}
                  style={{
                    fontFamily: "inherit",
                    fontSize: "13px",
                    padding: "10px 20px",
                    borderRadius: "8px",
                    border: tournamentMode ? "1px solid #fffeb2" : "1px solid rgba(255,255,255,0.12)",
                    background: tournamentMode ? "rgba(255,254,178,0.1)" : "rgba(255,255,255,0.03)",
                    color: tournamentMode ? "#fffeb2" : "rgba(255,255,255,0.5)",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  {tournamentMode ? "Tournament (3 Rounds)" : "Single Round"}
                </button>
              </div>
            </div>

            {/* Prediction */}
            <div
              className="glass-card"
              style={{
                textAlign: "center",
                marginBottom: "24px",
                maxWidth: "600px",
                margin: "0 auto 24px auto",
                padding: "24px",
              }}
            >
              <div
                className="font-display"
                style={{ fontSize: "18px", color: "#fffeb2", marginBottom: "16px" }}
              >
                WHO WILL WIN?
              </div>
              {!userPrediction ? (
                <div style={{ display: "flex", gap: "12px", justifyContent: "center", marginBottom: "16px" }}>
                  <button
                    className="prediction-btn"
                    onClick={async () => {
                      setUserPrediction("alpha");
                      try {
                        await fetch("/api/battle/predict", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ battleId, walletAddress: account, prediction: "alpha" }),
                        });
                        const res = await fetch(`/api/battle/predict?battleId=${battleId}`);
                        if (res.ok) {
                          const d = await res.json();
                          setPredictionStats({ alphaPercent: d.alphaPercent, omegaPercent: d.omegaPercent, total: d.total });
                        }
                      } catch { /* ignore */ }
                    }}
                    style={{
                      flex: 1,
                      fontFamily: "inherit",
                      fontSize: "14px",
                      fontWeight: 800,
                      padding: "14px 0",
                      borderRadius: "12px",
                      border: `2px solid ${ALPHA_COLOR}60`,
                      background: `rgba(255,254,178,0.1)`,
                      color: ALPHA_COLOR,
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {useCustomAgents && selectedAlpha ? selectedAlpha.name : ALPHA_CONFIG.name}
                  </button>
                  <button
                    className="prediction-btn"
                    onClick={async () => {
                      setUserPrediction("omega");
                      try {
                        await fetch("/api/battle/predict", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ battleId, walletAddress: account, prediction: "omega" }),
                        });
                        const res = await fetch(`/api/battle/predict?battleId=${battleId}`);
                        if (res.ok) {
                          const d = await res.json();
                          setPredictionStats({ alphaPercent: d.alphaPercent, omegaPercent: d.omegaPercent, total: d.total });
                        }
                      } catch { /* ignore */ }
                    }}
                    style={{
                      flex: 1,
                      fontFamily: "inherit",
                      fontSize: "14px",
                      fontWeight: 800,
                      padding: "14px 0",
                      borderRadius: "12px",
                      border: `2px solid ${OMEGA_COLOR}60`,
                      background: `rgba(255,66,94,0.1)`,
                      color: OMEGA_COLOR,
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {useCustomAgents && selectedOmega ? selectedOmega.name : OMEGA_CONFIG.name}
                  </button>
                </div>
              ) : (
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", marginBottom: "12px" }}>
                    You picked{" "}
                    <span style={{ color: userPrediction === "alpha" ? ALPHA_COLOR : OMEGA_COLOR, fontWeight: 700 }}>
                      {userPrediction === "alpha"
                        ? (useCustomAgents && selectedAlpha ? selectedAlpha.name : ALPHA_CONFIG.name)
                        : (useCustomAgents && selectedOmega ? selectedOmega.name : OMEGA_CONFIG.name)}
                    </span>
                  </div>
                </div>
              )}
              {/* Prediction bar */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12px", color: ALPHA_COLOR, fontWeight: 700, minWidth: "36px", textAlign: "right" }}>
                  {predictionStats.alphaPercent}%
                </span>
                <div
                  style={{
                    flex: 1,
                    height: "8px",
                    borderRadius: "4px",
                    background: "rgba(255,255,255,0.06)",
                    overflow: "hidden",
                    display: "flex",
                  }}
                >
                  <div
                    style={{
                      width: `${predictionStats.alphaPercent}%`,
                      background: `linear-gradient(90deg, ${ALPHA_COLOR}, ${ALPHA_COLOR}80)`,
                      borderRadius: "4px 0 0 4px",
                      transition: "width 0.5s ease",
                    }}
                  />
                  <div
                    style={{
                      width: `${predictionStats.omegaPercent}%`,
                      background: `linear-gradient(90deg, ${OMEGA_COLOR}80, ${OMEGA_COLOR})`,
                      borderRadius: "0 4px 4px 0",
                      transition: "width 0.5s ease",
                    }}
                  />
                </div>
                <span style={{ fontSize: "12px", color: OMEGA_COLOR, fontWeight: 700, minWidth: "36px", textAlign: "left" }}>
                  {predictionStats.omegaPercent}%
                </span>
              </div>
              {predictionStats.total > 0 && (
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.25)", marginTop: "8px" }}>
                  {predictionStats.total} prediction{predictionStats.total !== 1 ? "s" : ""}
                </div>
              )}
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
              <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", marginTop: "12px", maxWidth: "500px", margin: "12px auto 0 auto" }}>
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
                  className="font-display"
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
                {tournamentMode && (
                  <div style={{ fontSize: "13px", color: "#fffeb2", fontWeight: 700, marginBottom: "4px", letterSpacing: "0.1em" }}>
                    Round {tournamentRound}/3 — Alpha {tournamentScores.alpha} : {tournamentScores.omega} Omega
                  </div>
                )}
                <div style={{ fontSize: "14px", color: GOLD_COLOR, fontWeight: 600 }}>
                  {battleCategory && (
                    <span
                      style={{
                        fontSize: "12px",
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
                <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "center", marginTop: "8px" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#fffeb2", animation: "pulse 1.5s infinite" }} />
                  <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>{viewerCount} watching</span>
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
                  <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/*  PIXEL BATTLE ANIMATION                                      */}
        {/* ============================================================ */}

        {(phase === "fighting" || phase === "judging" || phase === "results") && (
          <div style={{ marginBottom: "28px", display: "flex", justifyContent: "center" }}>
            <PixelBattle
              alphaState={alphaAnimState}
              omegaState={omegaAnimState}
              alphaHP={alphaHP}
              omegaHP={omegaHP}
              width={700}
              height={220}
            />
          </div>
        )}

        {/* Live Reactions */}
        {phase === "fighting" && <BattleReactions />}

        {/* Spectator Chat */}
        {phase !== "setup" && (
          <div
            className="glass-card"
            style={{
              padding: "16px 18px",
              marginTop: "16px",
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.5)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                Spectator Chat
                {spectatorChatMessages.length > 0 && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "1px 6px",
                      borderRadius: 99,
                      background: "rgba(255,255,255,0.08)",
                      color: "rgba(255,255,255,0.5)",
                    }}
                  >
                    {spectatorChatMessages.length}
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "rgba(255,255,255,0.3)",
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                {viewerCount} watching
              </div>
            </div>

            <div
              ref={spectatorChatRef}
              style={{
                maxHeight: 160,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 6,
                paddingRight: 4,
              }}
            >
              {spectatorChatMessages.length === 0 ? (
                <div
                  style={{
                    padding: "16px 8px",
                    fontSize: 12,
                    color: "rgba(255,255,255,0.3)",
                    fontStyle: "italic",
                    textAlign: "center",
                  }}
                >
                  Be the first to say something.
                </div>
              ) : (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                spectatorChatMessages.map((m: any) => {
                  const isMine = m.sessionId && myChatSessionId && m.sessionId === myChatSessionId;
                  const name = m.wallet
                    ? `${String(m.wallet).slice(0, 4)}…${String(m.wallet).slice(-4)}`
                    : "Anon";
                  return (
                    <div
                      key={m.id}
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 8,
                        fontSize: 12,
                        padding: "4px 8px",
                        borderRadius: 6,
                        background: isMine ? "rgba(255,254,178,0.08)" : "transparent",
                        animation: "chat-in 0.2s ease-out",
                      }}
                    >
                      <span
                        style={{
                          color: isMine ? "#fffeb2" : "rgba(255,255,255,0.5)",
                          fontWeight: 700,
                          letterSpacing: "0.02em",
                          fontVariantNumeric: "tabular-nums",
                          flexShrink: 0,
                          minWidth: 44,
                        }}
                      >
                        {formatChatTime(m.createdAt) || ""}
                      </span>
                      <span
                        style={{
                          color: "#fffeb2",
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {name}
                      </span>
                      {isMine && (
                        <span
                          style={{
                            fontSize: 9,
                            padding: "1px 5px",
                            borderRadius: 3,
                            background: "#fffeb2",
                            color: "#000",
                            fontWeight: 800,
                            letterSpacing: "0.06em",
                          }}
                        >
                          YOU
                        </span>
                      )}
                      <span
                        style={{
                          color: "rgba(255,255,255,0.85)",
                          wordBreak: "break-word",
                          minWidth: 0,
                          flex: 1,
                        }}
                      >
                        {m.message}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {chatError && (
              <div
                style={{
                  marginTop: 8,
                  padding: "6px 10px",
                  fontSize: 11,
                  color: "#FF425E",
                  background: "rgba(255,66,94,0.08)",
                  border: "1px solid rgba(255,66,94,0.3)",
                  borderRadius: 6,
                }}
              >
                {chatError}
              </div>
            )}

            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 10,
                alignItems: "center",
              }}
            >
              <div style={{ position: "relative", flex: 1 }}>
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value.slice(0, 200))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") sendChat();
                  }}
                  placeholder="Say something…"
                  disabled={chatSending}
                  maxLength={200}
                  style={{
                    width: "100%",
                    fontFamily: "inherit",
                    fontSize: 12,
                    padding: "9px 52px 9px 12px",
                    borderRadius: 6,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.04)",
                    color: "#fff",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                <span
                  style={{
                    position: "absolute",
                    right: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontSize: 10,
                    color:
                      chatInput.length > 180
                        ? "#FFB84D"
                        : "rgba(255,255,255,0.3)",
                    fontVariantNumeric: "tabular-nums",
                    pointerEvents: "none",
                  }}
                >
                  {chatInput.length}/200
                </span>
              </div>
              <button
                onClick={sendChat}
                disabled={chatSending || !chatInput.trim()}
                style={{
                  fontFamily: "inherit",
                  fontSize: 11,
                  padding: "9px 16px",
                  borderRadius: 6,
                  border: "none",
                  background:
                    chatSending || !chatInput.trim()
                      ? "rgba(255,254,178,0.4)"
                      : "#fffeb2",
                  color: "#000",
                  cursor:
                    chatSending || !chatInput.trim() ? "not-allowed" : "pointer",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                {chatSending ? "…" : "Send"}
              </button>
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
                useCustomAgents && selectedAlpha ? { ...ALPHA_CONFIG, name: selectedAlpha.name, avatarSeed: selectedAlpha.avatarSeed || selectedAlpha.id } : ALPHA_CONFIG,
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
                alphaEloDelta,
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
                  <div style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.2)" }}>
                    total
                  </div>
                </div>
              </div>

              {/* Omega Panel */}
              {renderAgentPanel(
                useCustomAgents && selectedOmega ? { ...OMEGA_CONFIG, name: selectedOmega.name, avatarSeed: selectedOmega.avatarSeed || selectedOmega.id } : OMEGA_CONFIG,
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
                omegaEloDelta,
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
              className="font-display"
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
              className="font-display"
              style={{
                fontSize: "36px",
                fontWeight: 900,
                letterSpacing: "0.08em",
                color: GOLD_COLOR,
                textShadow: `0 0 30px ${GOLD_COLOR}50`,
                marginBottom: "8px",
              }}
            >
              {winner === "alpha"
                ? (useCustomAgents && selectedAlpha ? selectedAlpha.name : ALPHA_CONFIG.name)
                : (useCustomAgents && selectedOmega ? selectedOmega.name : OMEGA_CONFIG.name)} WINS!
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
                marginBottom: "12px",
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
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "16px" }}>
              ALPHA &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; OMEGA
            </div>

            {/* ELO Delta Display */}
            {showEloDelta && (alphaEloDelta !== null || omegaEloDelta !== null) && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: "48px",
                  marginBottom: "12px",
                  animation: "slide-up 0.6s ease-out",
                }}
              >
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      fontSize: "18px",
                      fontWeight: 900,
                      fontFamily: "monospace",
                      color: alphaEloDelta && alphaEloDelta > 0 ? "#22CC44" : OMEGA_COLOR,
                      textShadow: alphaEloDelta && alphaEloDelta > 0
                        ? "0 0 10px rgba(34,204,68,0.4)"
                        : "0 0 10px rgba(255,66,94,0.4)",
                    }}
                  >
                    {alphaEloDelta !== null ? (alphaEloDelta > 0 ? `+${alphaEloDelta}` : alphaEloDelta) : "..."}
                  </div>
                  <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    ALPHA ELO
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      fontSize: "18px",
                      fontWeight: 900,
                      fontFamily: "monospace",
                      color: omegaEloDelta && omegaEloDelta > 0 ? "#22CC44" : OMEGA_COLOR,
                      textShadow: omegaEloDelta && omegaEloDelta > 0
                        ? "0 0 10px rgba(34,204,68,0.4)"
                        : "0 0 10px rgba(255,66,94,0.4)",
                    }}
                  >
                    {omegaEloDelta !== null ? (omegaEloDelta > 0 ? `+${omegaEloDelta}` : omegaEloDelta) : "..."}
                  </div>
                  <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    OMEGA ELO
                  </div>
                </div>
              </div>
            )}

            {/* Spectator XP badge */}
            {spectatorXpAwarded > 0 && (
              <div
                style={{
                  display: "inline-block",
                  padding: "6px 16px",
                  borderRadius: "20px",
                  background: "rgba(34,204,68,0.15)",
                  border: "1px solid rgba(34,204,68,0.3)",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#22CC44",
                  animation: "xp-pop 0.8s ease-out forwards",
                }}
              >
                +{spectatorXpAwarded} XP for watching!
              </div>
            )}
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
                className="font-display"
                style={{
                  fontSize: "14px",
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
                  { label: "Delivery", alpha: alphaVerified ? "\u2713 Committed" : "Pending", omega: omegaVerified ? "\u2713 Committed" : "Pending" },
                  {
                    label: "ELO",
                    alpha: alphaEloDelta !== null ? `${alphaElo.elo} (${alphaEloDelta > 0 ? "+" : ""}${alphaEloDelta})` : `${alphaElo.elo}`,
                    omega: omegaEloDelta !== null ? `${omegaElo.elo} (${omegaEloDelta > 0 ? "+" : ""}${omegaEloDelta})` : `${omegaElo.elo}`,
                  },
                ].map((row) => (
                  <div key={row.label} style={{ display: "contents" }}>
                    <div
                      style={{
                        padding: "10px 12px",
                        color: "rgba(255,255,255,0.4)",
                        fontWeight: 600,
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                        textTransform: "uppercase",
                        fontSize: "12px",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {row.label}
                    </div>
                    <div
                      style={{
                        padding: "10px 12px",
                        textAlign: "center",
                        color: row.label === "ELO" && alphaEloDelta !== null
                          ? (alphaEloDelta > 0 ? "#22CC44" : OMEGA_COLOR)
                          : "rgba(255,255,255,0.7)",
                        fontFamily: row.label === "Hash" || row.label === "ELO" ? "monospace" : "inherit",
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                        fontWeight: row.label === "Score" || row.label === "ELO" ? 700 : 400,
                      }}
                    >
                      {row.alpha}
                    </div>
                    <div
                      style={{
                        padding: "10px 12px",
                        textAlign: "center",
                        color: row.label === "ELO" && omegaEloDelta !== null
                          ? (omegaEloDelta > 0 ? "#22CC44" : OMEGA_COLOR)
                          : "rgba(255,255,255,0.7)",
                        fontFamily: row.label === "Hash" || row.label === "ELO" ? "monospace" : "inherit",
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                        fontWeight: row.label === "Score" || row.label === "ELO" ? 700 : 400,
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
                  className="font-display"
                  style={{
                    fontSize: "14px",
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
                <div style={{ marginTop: "10px", fontSize: "12px", color: "rgba(255,255,255,0.25)" }}>
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
                  className="font-display"
                  style={{
                    fontSize: "14px",
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
                        fontSize: "12px",
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

            {/* Battle Result Card */}
            {phase === "results" && winner && (
              <div style={{
                marginTop: "24px",
                padding: "32px",
                borderRadius: "16px",
                backgroundColor: "rgba(0,0,0,0.5)",
                border: "1px solid rgba(255,254,178,0.2)",
                textAlign: "center",
                maxWidth: "600px",
                margin: "24px auto",
              }}>
                <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "16px" }}>
                  Battle Result
                </div>
                <div className="font-display" style={{ fontSize: "32px", color: "#fffeb2", marginBottom: "8px" }}>
                  {winner === "alpha"
                    ? (useCustomAgents && selectedAlpha ? selectedAlpha.name : ALPHA_CONFIG.name)
                    : (useCustomAgents && selectedOmega ? selectedOmega.name : OMEGA_CONFIG.name)} WINS
                </div>
                <div style={{ fontSize: "16px", color: "rgba(255,255,255,0.6)", marginBottom: "20px" }}>
                  {alphaScore !== null ? alphaScore.toFixed(1) : "?"} — {omegaScore !== null ? omegaScore.toFixed(1) : "?"}
                </div>
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.25)", marginBottom: "16px" }}>
                  covenant.run/battle
                </div>
                <button
                  onClick={() => {
                    const winnerName = winner === "alpha"
                      ? (useCustomAgents && selectedAlpha ? selectedAlpha.name : ALPHA_CONFIG.name)
                      : (useCustomAgents && selectedOmega ? selectedOmega.name : OMEGA_CONFIG.name);
                    const aScore = alphaScore !== null ? alphaScore.toFixed(1) : "?";
                    const oScore = omegaScore !== null ? omegaScore.toFixed(1) : "?";
                    const text = `${winnerName} wins! Score: ${aScore} vs ${oScore} on @WCovenant covenant.run/battle`;
                    window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
                  }}
                  style={{
                    fontFamily: "inherit",
                    fontSize: "13px",
                    fontWeight: 700,
                    padding: "12px 28px",
                    borderRadius: "8px",
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: "rgba(255,255,255,0.06)",
                    color: "#fff",
                    cursor: "pointer",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Share on X
                </button>
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
                <div style={{ marginTop: "10px", fontSize: "12px", color: "rgba(255,255,255,0.25)" }}>
                  Completed in {totalTime}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/*  Agent Chat -- always show when messages exist                */}
        {/* ============================================================ */}

        {(chatMessages.length > 0 || phase === "fighting") && (
          <div
            className="glass-card-strong"
            style={{ padding: "20px", marginBottom: "28px" }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "16px",
              }}
            >
              <div
                className="font-display"
                style={{
                  fontSize: "14px",
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.4)",
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                }}
              >
                Agent Chat
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 10,
                  color: "rgba(255,255,255,0.35)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: phase === "fighting" ? "#7CFF7C" : "rgba(255,255,255,0.3)",
                    boxShadow: phase === "fighting" ? "0 0 6px #7CFF7C" : "none",
                    animation: phase === "fighting" ? "pulse 1.4s ease-in-out infinite" : "none",
                  }}
                />
                {phase === "fighting" ? "Live" : "Replay"}
              </div>
            </div>
            <div
              ref={chatPanelRef}
              style={{
                maxHeight: "320px",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 4,
                paddingRight: 4,
              }}
            >
              {chatMessages.length === 0 ? (
                <div
                  style={{
                    padding: "24px 12px",
                    textAlign: "center",
                    fontSize: 12,
                    color: "rgba(255,255,255,0.35)",
                    fontStyle: "italic",
                  }}
                >
                  Agents are preparing…
                </div>
              ) : (
                chatMessages.map((msg, i) => {
                  const isAlpha = msg.agent === "alpha";
                  const agentColor = isAlpha ? ALPHA_COLOR : OMEGA_COLOR;
                  const isLastTyping =
                    i === chatMessages.length - 1 &&
                    msg.displayText.length < msg.message.length;
                  const alignment = isAlpha ? "flex-start" : "flex-end";

                  // Custom agent name fallback: prefer msg.agentName (sent
                  // by backend for custom agents), else use selected
                  // custom agent's name from local state, else static
                  // "Alpha" / "Omega".
                  const displayName =
                    msg.agentName ||
                    (useCustomAgents && isAlpha && selectedAlpha?.name) ||
                    (useCustomAgents && !isAlpha && selectedOmega?.name) ||
                    (isAlpha ? "Alpha" : "Omega");

                  // Group consecutive messages from the same agent
                  // within the same phase so we don't repeat the
                  // avatar + name header on every bubble.
                  const prev = chatMessages[i - 1];
                  const isGrouped =
                    prev && prev.agent === msg.agent && prev.phase === msg.phase;

                  // Phase badge — only for the first message in a group
                  // and only when phase is known. "pre_battle" → TAUNT,
                  // "post_battle" → winner/loser tagged by content.
                  let phaseLabel: string | null = null;
                  let phaseTone = "rgba(255,255,255,0.4)";
                  if (!isGrouped && msg.phase === "pre_battle") {
                    phaseLabel = "Taunt";
                  } else if (!isGrouped && msg.phase === "post_battle") {
                    phaseLabel = winner === msg.agent ? "Victory" : "Concede";
                    phaseTone = winner === msg.agent ? "#7CFF7C" : "rgba(255,255,255,0.45)";
                  }

                  // Avatar initial
                  const initial = displayName.trim().charAt(0).toUpperCase() || "?";

                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        justifyContent: alignment,
                        marginTop: isGrouped ? 2 : 8,
                        animation: "chat-in 0.25s ease-out",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexDirection: isAlpha ? "row" : "row-reverse",
                          alignItems: "flex-end",
                          gap: 8,
                          maxWidth: "75%",
                        }}
                      >
                        {/* Avatar — hidden on grouped messages */}
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 999,
                            flexShrink: 0,
                            visibility: isGrouped ? "hidden" : "visible",
                            background: `${agentColor}20`,
                            border: `1.5px solid ${agentColor}60`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: agentColor,
                            fontWeight: 800,
                            fontSize: 12,
                            letterSpacing: 0,
                          }}
                        >
                          {initial}
                        </div>

                        <div style={{ minWidth: 0 }}>
                          {/* Header — hidden on grouped messages */}
                          {!isGrouped && (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                marginBottom: 4,
                                paddingLeft: isAlpha ? 4 : 0,
                                paddingRight: isAlpha ? 0 : 4,
                                flexDirection: isAlpha ? "row" : "row-reverse",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 800,
                                  color: agentColor,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.06em",
                                }}
                              >
                                {displayName}
                              </span>
                              {phaseLabel && (
                                <span
                                  style={{
                                    fontSize: 9,
                                    padding: "1px 6px",
                                    borderRadius: 3,
                                    fontWeight: 700,
                                    letterSpacing: "0.08em",
                                    textTransform: "uppercase",
                                    color: phaseTone,
                                    background: `${phaseTone === "#7CFF7C" ? "#7CFF7C" : "#fff"}10`,
                                    border: `1px solid ${phaseTone}30`,
                                  }}
                                >
                                  {phaseLabel}
                                </span>
                              )}
                              <span
                                style={{
                                  fontSize: 10,
                                  color: "rgba(255,255,255,0.2)",
                                  fontVariantNumeric: "tabular-nums",
                                }}
                              >
                                {msg.timestamp}
                              </span>
                            </div>
                          )}

                          <div
                            style={{
                              padding: "9px 14px",
                              borderRadius: isAlpha
                                ? `${isGrouped ? 14 : 14}px 14px 14px ${isGrouped ? 14 : 4}px`
                                : `14px ${isGrouped ? 14 : 14}px ${isGrouped ? 14 : 4}px 14px`,
                              background: `${agentColor}15`,
                              border: `1px solid ${agentColor}25`,
                              fontSize: 13,
                              lineHeight: 1.55,
                              color: "rgba(255,255,255,0.88)",
                              wordBreak: "break-word",
                            }}
                          >
                            {msg.displayText}
                            {isLastTyping && (
                              <span
                                style={{
                                  color: agentColor,
                                  marginLeft: 1,
                                  animation: "blink 0.9s step-end infinite",
                                  fontWeight: 700,
                                }}
                              >
                                {"\u258A"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/*  SECTION 5: BATTLE HISTORY (results phase only — setup gets  */}
        {/*  its own render below after the stats strip)                  */}
        {/* ============================================================ */}

        {phase === "results" && <BattleHistoryList items={battleHistory} />}

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
                <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Setup phase battle history */}
        {phase === "setup" && (
          <BattleHistoryList items={battleHistory} />
        )}
      </div>
    </div>
  );
}
