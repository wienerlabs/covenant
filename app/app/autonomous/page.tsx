"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import NavBar from "@/components/NavBar";
import PixelAgent from "@/components/PixelAgent";
import { fireConfetti } from "@/lib/confetti";

type AgentState = "idle" | "thinking" | "working" | "celebrating";

interface AutoEvent {
  step: string;
  message: string;
  data: Record<string, unknown> | null;
}

interface LogEntry {
  timestamp: string;
  event: AutoEvent;
}

interface JobCard {
  id: string;
  title: string;
  amount: number;
  category: string;
  status: "found" | "accepted" | "working" | "submitting" | "completed";
  round: number;
}

interface RunHistory {
  date: string;
  rounds: number;
  jobsCompleted: number;
  earned: number;
  duration: number;
}

type PipelineStep = "SCAN" | "FIND" | "ACCEPT" | "WORK" | "SUBMIT" | "EARN";

const PIPELINE_STEPS: { key: PipelineStep; num: string; label: string }[] = [
  { key: "SCAN", num: "01", label: "SCAN" },
  { key: "FIND", num: "02", label: "FIND" },
  { key: "ACCEPT", num: "03", label: "ACCEPT" },
  { key: "WORK", num: "04", label: "WORK" },
  { key: "SUBMIT", num: "05", label: "SUBMIT" },
  { key: "EARN", num: "06", label: "EARN" },
];

const ALL_CATEGORIES = [
  { id: "writing", label: "Writing" },
  { id: "code_review", label: "Code Review" },
  { id: "translation", label: "Translation" },
  { id: "data_labeling", label: "Data Labeling" },
  { id: "bug_bounty", label: "Bug Bounty" },
  { id: "design", label: "Design" },
];

const OMEGA_CONFIG = {
  name: "AGENT OMEGA",
  wallet: process.env.NEXT_PUBLIC_AGENT_OMEGA_WALLET || "55EbEM7x6WQxVFSt1KennwYBPgWF7GgF5bd2R2FVxiw1",
  color: "#FF425E",
  avatarSeed: "agent-omega-covenant-2026",
};

const STORAGE_KEY = "covenant_auto_runs";

function getTimestamp(): string {
  return new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function getCategoryColor(cat: string): string {
  const map: Record<string, string> = {
    writing: "#a78bfa",
    code_review: "#60a5fa",
    translation: "#34d399",
    data_labeling: "#fbbf24",
    bug_bounty: "#f87171",
    design: "#f472b6",
  };
  return map[cat] || "#fffeb2";
}

function loadHistory(): RunHistory[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as RunHistory[];
  } catch { /* ignore */ }
  return [];
}

function saveHistory(runs: RunHistory[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs.slice(-10)));
  } catch { /* ignore */ }
}

export default function AutonomousPage() {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [maxRounds, setMaxRounds] = useState(3);
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logPanelRef = useRef<HTMLDivElement>(null);

  // Live stats
  const [currentRound, setCurrentRound] = useState(0);
  const [totalRoundsMax, setTotalRoundsMax] = useState(0);
  const [jobsCompleted, setJobsCompleted] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [avgTimePerRound, setAvgTimePerRound] = useState(0);

  // Phase 2: Pipeline
  const [pipelineStep, setPipelineStep] = useState<PipelineStep | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<PipelineStep>>(new Set());

  // Phase 3: Job cards
  const [activeJob, setActiveJob] = useState<JobCard | null>(null);
  const [completedJobs, setCompletedJobs] = useState<JobCard[]>([]);

  // Phase 4: Earnings graph
  const [roundEarnings, setRoundEarnings] = useState<number[]>([]);
  const earningsRef = useRef<number>(0);

  // Phase 5: Strategy config
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set(ALL_CATEGORIES.map((c) => c.id))
  );
  const [minAmount, setMinAmount] = useState(5);
  const [speed, setSpeed] = useState<"fast" | "thorough">("fast");

  // Phase 6: History
  const [history, setHistory] = useState<RunHistory[]>([]);

  // Terminal collapsed state
  const [terminalOpen, setTerminalOpen] = useState(false);

  // Load history on mount
  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // Timer
  useEffect(() => {
    if (!running || !startTime) return;
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [running, startTime]);

  useEffect(() => {
    if (logPanelRef.current) {
      logPanelRef.current.scrollTop = logPanelRef.current.scrollHeight;
    }
  }, [logs]);

  // Auto-collapse terminal when jobs are showing
  useEffect(() => {
    if (activeJob || completedJobs.length > 0) {
      setTerminalOpen(false);
    }
  }, [activeJob, completedJobs.length]);

  const handleEvent = useCallback((event: AutoEvent) => {
    setLogs((prev) => [...prev, { timestamp: getTimestamp(), event }]);

    switch (event.step) {
      case "auto_round_start": {
        const round = Number(event.data?.round || 0);
        setCurrentRound(round);
        setTotalRoundsMax(Number(event.data?.maxRounds || 0));
        setAgentState("thinking");
        // Reset pipeline for new round
        setPipelineStep(null);
        setCompletedSteps(new Set());
        earningsRef.current = 0;
        break;
      }
      case "auto_scanning":
        setAgentState("thinking");
        setPipelineStep("SCAN");
        setCompletedSteps(new Set());
        break;
      case "auto_found_job": {
        setAgentState("working");
        setCompletedSteps((prev) => new Set([...prev, "SCAN"]));
        setPipelineStep("FIND");
        const jobTitle = String(event.data?.title || event.data?.jobTitle || "Untitled Job");
        const jobAmount = Number(event.data?.amount || event.data?.reward || 0);
        const jobCategory = String(event.data?.category || event.data?.type || "writing");
        const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        setActiveJob({
          id: jobId,
          title: jobTitle,
          amount: jobAmount,
          category: jobCategory,
          status: "found",
          round: Number(event.data?.round || 0),
        });
        break;
      }
      case "auto_accepting":
        setAgentState("working");
        setCompletedSteps((prev) => new Set([...prev, "SCAN", "FIND"]));
        setPipelineStep("ACCEPT");
        setActiveJob((prev) => prev ? { ...prev, status: "accepted" } : prev);
        break;
      case "auto_working":
        setAgentState("working");
        setCompletedSteps((prev) => new Set([...prev, "SCAN", "FIND", "ACCEPT"]));
        setPipelineStep("WORK");
        setActiveJob((prev) => prev ? { ...prev, status: "working" } : prev);
        break;
      case "auto_submitting":
        setAgentState("working");
        setCompletedSteps((prev) => new Set([...prev, "SCAN", "FIND", "ACCEPT", "WORK"]));
        setPipelineStep("SUBMIT");
        setActiveJob((prev) => prev ? { ...prev, status: "submitting" } : prev);
        break;
      case "auto_completed": {
        setAgentState("celebrating");
        setCompletedSteps((prev) => new Set([...prev, "SCAN", "FIND", "ACCEPT", "WORK", "SUBMIT"]));
        setPipelineStep("EARN");
        const earnedAmount = Number(event.data?.amount || event.data?.reward || 0);
        earningsRef.current += earnedAmount;
        setActiveJob((prev) => {
          if (prev) {
            const completed = { ...prev, status: "completed" as const, amount: earnedAmount || prev.amount };
            setCompletedJobs((cj) => [completed, ...cj].slice(0, 5));
            return null;
          }
          return prev;
        });
        setTimeout(() => setAgentState("idle"), 1500);
        break;
      }
      case "auto_round_end": {
        setJobsCompleted(Number(event.data?.totalJobsDone || 0));
        setTotalEarned(Number(event.data?.totalEarned || 0));
        setAgentState("celebrating");
        setCompletedSteps(new Set(["SCAN", "FIND", "ACCEPT", "WORK", "SUBMIT", "EARN"]));
        setPipelineStep("EARN");
        const roundEarn = Number(event.data?.roundEarned || event.data?.earned || earningsRef.current || 0);
        setRoundEarnings((prev) => [...prev, roundEarn]);
        fireConfetti();
        setTimeout(() => setAgentState("idle"), 1000);
        break;
      }
      case "auto_complete": {
        setDone(true);
        setAgentState("celebrating");
        const finalJobs = Number(event.data?.totalJobsDone || 0);
        const finalEarned = Number(event.data?.totalEarned || 0);
        if (event.data) {
          setJobsCompleted(finalJobs);
          setTotalEarned(finalEarned);
          setAvgTimePerRound(Number(event.data.avgTimePerRound || 0));
        }
        fireConfetti();
        // Save to history
        setStartTime((st) => {
          const duration = st ? Math.floor((Date.now() - st) / 1000) : 0;
          const entry: RunHistory = {
            date: new Date().toISOString(),
            rounds: Number(event.data?.totalRounds || event.data?.maxRounds || 0),
            jobsCompleted: finalJobs,
            earned: finalEarned,
            duration,
          };
          const updated = [...loadHistory(), entry].slice(-10);
          saveHistory(updated);
          setHistory(updated);
          return st;
        });
        break;
      }
      case "error":
        setDone(true);
        setAgentState("idle");
        break;
    }
  }, []);

  async function startAutonomous() {
    setRunning(true);
    setDone(false);
    setLogs([]);
    setCurrentRound(0);
    setTotalRoundsMax(maxRounds);
    setJobsCompleted(0);
    setTotalEarned(0);
    setElapsedTime(0);
    setAvgTimePerRound(0);
    setAgentState("idle");
    setStartTime(Date.now());
    setPipelineStep(null);
    setCompletedSteps(new Set());
    setActiveJob(null);
    setCompletedJobs([]);
    setRoundEarnings([]);
    earningsRef.current = 0;
    setTerminalOpen(false);

    try {
      const response = await fetch("/api/autonomous/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentWallet: OMEGA_CONFIG.wallet,
          maxRounds,
          categories: Array.from(selectedCategories),
          minAmount,
          speed,
        }),
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
            const event: AutoEvent = JSON.parse(trimmed);
            handleEvent(event);
          } catch {
            // Skip malformed
          }
        }
      }

      if (buffer.trim()) {
        try {
          handleEvent(JSON.parse(buffer.trim()));
        } catch { /* skip */ }
      }
    } catch (err) {
      console.error("[autonomous] Error:", err);
    }

    setRunning(false);
  }

  function getEventColor(step: string): string {
    if (step.includes("scanning")) return "#fffeb2";
    if (step.includes("working") || step.includes("accepting")) return "#fffeb2";
    if (step.includes("completed") || step.includes("round_end")) return "#fffeb2";
    if (step.includes("found")) return "#fffeb2";
    if (step.includes("submitting")) return "#fffeb2";
    if (step.includes("error")) return "#FF425E";
    if (step.includes("auto_complete")) return "#fffeb2";
    return "rgba(255,255,255,0.5)";
  }

  function toggleCategory(id: string) {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function clearHistory() {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setHistory([]);
  }

  function formatDuration(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  const progressPercent = totalRoundsMax > 0 ? (currentRound / totalRoundsMax) * 100 : 0;
  const maxEarning = roundEarnings.length > 0 ? Math.max(...roundEarnings, 1) : 1;
  const showJobCards = activeJob !== null || completedJobs.length > 0;

  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: "#0a0a14",
      color: "#ffffff",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* ASCII art video background */}
      <video
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: 0.35,
        }}
      >
        <source src="/ascii-art.mp4" type="video/mp4" />
      </video>
      <div style={{ position: "fixed", inset: 0, zIndex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} />
      <style>{`
        @keyframes count-up {
          from { opacity: 0.5; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pipeline-active {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        @keyframes dash-flow {
          0% { stroke-dashoffset: 12; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes slide-in {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes bar-grow {
          from { transform: scaleY(0); }
          to { transform: scaleY(1); }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes loading-slide {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(150%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>

      <div style={{ position: "relative", zIndex: 2 }}>
      <NavBar activeTab="autonomous" variant="dark" />

      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px" }}>
        {/* Title */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <h1 style={{
            fontSize: "42px",
            fontWeight: 700,
            letterSpacing: "0.06em",
            color: "#ffffff",
            marginBottom: "10px",
            fontFamily: "inherit",
          }}>
            MISSION CONTROL
          </h1>
          <p style={{ fontSize: "16px", color: "rgba(255,255,255,0.45)", maxWidth: "560px", margin: "0 auto", lineHeight: 1.7, fontFamily: "inherit" }}>
            Release an AI agent. Watch it find work, complete jobs, and earn USDC &mdash; all on its own.
          </p>
        </div>

        {/* Agent Profile Card */}
        <div style={{
          backgroundColor: "rgba(0,0,0,0.4)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "12px",
          padding: "32px",
          backdropFilter: "blur(12px)",
          marginBottom: "24px",
          textAlign: "center",
        }}>
          <PixelAgent seed={OMEGA_CONFIG.avatarSeed} color={OMEGA_CONFIG.color} size={120} state={agentState} />
          <div style={{ fontSize: "18px", fontWeight: 700, marginTop: "14px", letterSpacing: "0.04em", fontFamily: "inherit" }}>
            AGENT OMEGA
          </div>
          <div style={{ fontSize: "13px", color: OMEGA_CONFIG.color, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: "6px", fontFamily: "inherit" }}>
            AUTONOMOUS MODE
          </div>

          {/* Live stats row */}
          <div style={{
            display: "flex",
            justifyContent: "center",
            gap: "40px",
            marginTop: "24px",
            flexWrap: "wrap",
          }}>
            <div>
              <div style={{ fontSize: "28px", fontWeight: 700, color: "#fffeb2", animation: running ? "count-up 0.3s ease" : "none", fontFamily: "inherit" }}>
                {jobsCompleted}
              </div>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "inherit" }}>
                Jobs Done
              </div>
            </div>
            <div>
              <div style={{ fontSize: "28px", fontWeight: 700, color: "#fffeb2", animation: running ? "count-up 0.3s ease" : "none", fontFamily: "inherit" }}>
                {totalEarned.toFixed(0)}
              </div>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "inherit" }}>
                USDC Earned
              </div>
            </div>
            <div>
              <div style={{ fontSize: "28px", fontWeight: 700, color: "rgba(255,255,255,0.7)", fontFamily: "inherit" }}>
                {Math.floor(elapsedTime / 60)}:{String(elapsedTime % 60).padStart(2, "0")}
              </div>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "inherit" }}>
                Time Running
              </div>
            </div>
          </div>
        </div>

        {/* Phase 2: Pipeline Visualization */}
        {running && (
          <div style={{
            backgroundColor: "rgba(0,0,0,0.4)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "12px",
            padding: "28px 24px",
            backdropFilter: "blur(12px)",
            marginBottom: "24px",
          }}>
            <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "24px", textAlign: "center", fontFamily: "inherit" }}>
              Pipeline &mdash; Round {currentRound}
            </div>
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0",
              overflowX: "auto",
            }}>
              {PIPELINE_STEPS.map((step, i) => {
                const isActive = pipelineStep === step.key;
                const isCompleted = completedSteps.has(step.key) && !isActive;
                const isPast = completedSteps.has(step.key);
                return (
                  <div key={step.key} style={{ display: "flex", alignItems: "center" }}>
                    <div style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "8px",
                    }}>
                      <div style={{
                        width: "48px",
                        height: "48px",
                        borderRadius: "10px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "2px",
                        backgroundColor: isActive
                          ? "rgba(255,254,178,0.1)"
                          : isCompleted
                            ? "rgba(255,254,178,0.06)"
                            : "rgba(255,255,255,0.03)",
                        border: isActive
                          ? "1.5px solid #fffeb2"
                          : isCompleted
                            ? "1.5px solid rgba(255,254,178,0.35)"
                            : "1px solid rgba(255,255,255,0.08)",
                        animation: isActive ? "pipeline-active 1.5s ease-in-out infinite" : "none",
                        transition: "all 0.3s ease",
                      }}>
                        <span style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          color: isActive ? "#fffeb2" : isCompleted ? "rgba(255,254,178,0.6)" : "rgba(255,255,255,0.25)",
                          letterSpacing: "0.04em",
                          fontFamily: "inherit",
                        }}>
                          {isCompleted ? "\u2713" : step.num}
                        </span>
                      </div>
                      <span style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        letterSpacing: "0.08em",
                        color: isActive ? "#fffeb2" : isPast ? "rgba(255,254,178,0.5)" : "rgba(255,255,255,0.25)",
                        fontFamily: "inherit",
                        transition: "color 0.3s ease",
                      }}>
                        {step.label}
                      </span>
                    </div>
                    {i < PIPELINE_STEPS.length - 1 && (
                      <div style={{ width: "36px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "22px" }}>
                        <svg width="36" height="2" viewBox="0 0 36 2">
                          <line
                            x1="0" y1="1" x2="36" y2="1"
                            stroke={isPast ? "rgba(255,254,178,0.4)" : "rgba(255,255,255,0.1)"}
                            strokeWidth="2"
                            strokeDasharray="6 6"
                            style={{
                              animation: isActive ? "dash-flow 0.8s linear infinite" : "none",
                            }}
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Phase 3: Live Job Cards */}
        {showJobCards && (
          <div style={{
            marginBottom: "24px",
          }}>
            {/* Active job */}
            {activeJob && (
              <div style={{
                backgroundColor: "rgba(0,0,0,0.4)",
                border: activeJob.status === "completed"
                  ? "1px solid rgba(255,254,178,0.4)"
                  : "1px solid rgba(255,254,178,0.25)",
                borderRadius: "12px",
                padding: "20px 24px",
                backdropFilter: "blur(12px)",
                marginBottom: "12px",
                animation: "slide-in 0.4s ease-out",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "14px", flex: 1, minWidth: 0 }}>
                    <div style={{
                      width: "10px",
                      height: "10px",
                      borderRadius: "50%",
                      backgroundColor: "#fffeb2",
                      animation: "pipeline-active 1.5s ease-in-out infinite",
                      flexShrink: 0,
                    }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "15px", fontWeight: 600, color: "#ffffff", fontFamily: "inherit", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {activeJob.title}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "4px" }}>
                        <span style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: "4px",
                          backgroundColor: `${getCategoryColor(activeJob.category)}20`,
                          color: getCategoryColor(activeJob.category),
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          fontFamily: "inherit",
                        }}>
                          {activeJob.category.replace("_", " ")}
                        </span>
                        <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", fontFamily: "inherit" }}>
                          Round {activeJob.round || currentRound}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <span style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: activeJob.status === "working" ? "#fffeb2" : "rgba(255,255,255,0.5)",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      fontFamily: "inherit",
                    }}>
                      {activeJob.status === "found" && "Found"}
                      {activeJob.status === "accepted" && "Accepting..."}
                      {activeJob.status === "working" && "Working..."}
                      {activeJob.status === "submitting" && "Submitting..."}
                    </span>
                    {activeJob.amount > 0 && (
                      <span style={{
                        fontSize: "15px",
                        fontWeight: 700,
                        color: "#fffeb2",
                        fontFamily: "inherit",
                      }}>
                        {activeJob.amount} USDC
                      </span>
                    )}
                  </div>
                </div>
                {/* Progress indicator while working */}
                {(activeJob.status === "working" || activeJob.status === "submitting") && (
                  <div style={{
                    marginTop: "14px",
                    width: "100%",
                    height: "3px",
                    backgroundColor: "rgba(255,255,255,0.06)",
                    borderRadius: "2px",
                    overflow: "hidden",
                  }}>
                    <div style={{
                      width: "40%",
                      height: "100%",
                      backgroundColor: "#fffeb2",
                      borderRadius: "2px",
                      animation: "loading-slide 2s ease-in-out infinite",
                    }} />
                  </div>
                )}
              </div>
            )}

            {/* Completed jobs stack */}
            {completedJobs.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {completedJobs.map((job, i) => (
                  <div key={job.id} style={{
                    backgroundColor: "rgba(255,254,178,0.04)",
                    border: "1px solid rgba(255,254,178,0.15)",
                    borderRadius: "10px",
                    padding: "14px 20px",
                    backdropFilter: "blur(12px)",
                    animation: "fade-in 0.3s ease-out",
                    opacity: 1 - (i * 0.15),
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                        <span style={{ color: "#fffeb2", fontSize: "14px" }}>{"\u2713"}</span>
                        <span style={{ fontSize: "14px", fontWeight: 500, color: "rgba(255,255,255,0.6)", fontFamily: "inherit", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {job.title}
                        </span>
                        <span style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          padding: "2px 6px",
                          borderRadius: "4px",
                          backgroundColor: `${getCategoryColor(job.category)}15`,
                          color: `${getCategoryColor(job.category)}99`,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          fontFamily: "inherit",
                          flexShrink: 0,
                        }}>
                          {job.category.replace("_", " ")}
                        </span>
                      </div>
                      {job.amount > 0 && (
                        <span style={{
                          fontSize: "14px",
                          fontWeight: 700,
                          color: "#fffeb2",
                          fontFamily: "inherit",
                          animation: "fade-in 0.3s ease-out",
                          flexShrink: 0,
                        }}>
                          +{job.amount} USDC
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Control Panel */}
        <div style={{
          backgroundColor: "rgba(0,0,0,0.4)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "12px",
          padding: "28px",
          backdropFilter: "blur(12px)",
          marginBottom: "24px",
          textAlign: "center",
        }}>
          {!running && !done && (
            <>
              {/* Max Rounds */}
              <div style={{ marginBottom: "24px" }}>
                <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px", fontFamily: "inherit" }}>
                  Max Rounds
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: "8px" }}>
                  {[1, 3, 5, 10].map((n) => (
                    <button
                      key={n}
                      onClick={() => setMaxRounds(n)}
                      style={{
                        padding: "10px 22px",
                        fontSize: "14px",
                        fontWeight: maxRounds === n ? 700 : 400,
                        backgroundColor: maxRounds === n ? "rgba(255,254,178,0.1)" : "rgba(255,255,255,0.04)",
                        color: maxRounds === n ? "#fffeb2" : "rgba(255,255,255,0.5)",
                        border: maxRounds === n ? "1px solid rgba(255,254,178,0.3)" : "1px solid rgba(255,255,255,0.08)",
                        borderRadius: "8px",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Phase 5: Strategy Config */}
              <div style={{
                borderTop: "1px solid rgba(255,255,255,0.08)",
                paddingTop: "24px",
                marginBottom: "24px",
              }}>
                <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "16px", fontFamily: "inherit" }}>
                  Agent Strategy
                </div>

                {/* Category checkboxes */}
                <div style={{ marginBottom: "20px" }}>
                  <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", marginBottom: "10px", fontFamily: "inherit" }}>
                    Target Categories
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px" }}>
                    {ALL_CATEGORIES.map((cat) => {
                      const selected = selectedCategories.has(cat.id);
                      const catColor = getCategoryColor(cat.id);
                      return (
                        <button
                          key={cat.id}
                          onClick={() => toggleCategory(cat.id)}
                          style={{
                            padding: "7px 14px",
                            fontSize: "13px",
                            fontWeight: selected ? 600 : 400,
                            backgroundColor: selected ? `${catColor}18` : "rgba(255,255,255,0.04)",
                            color: selected ? catColor : "rgba(255,255,255,0.4)",
                            border: selected ? `1px solid ${catColor}50` : "1px solid rgba(255,255,255,0.08)",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            transition: "all 0.15s ease",
                          }}
                        >
                          {selected ? "\u2713 " : ""}{cat.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Min amount slider */}
                <div style={{ marginBottom: "20px", maxWidth: "320px", margin: "0 auto 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", fontFamily: "inherit" }}>Min Amount</span>
                    <span style={{ fontSize: "14px", fontWeight: 600, color: "#fffeb2", fontFamily: "inherit" }}>{minAmount} USDC</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={50}
                    value={minAmount}
                    onChange={(e) => setMinAmount(Number(e.target.value))}
                    style={{
                      width: "100%",
                      accentColor: "#fffeb2",
                      cursor: "pointer",
                    }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.2)", fontFamily: "inherit" }}>1 USDC</span>
                    <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.2)", fontFamily: "inherit" }}>50 USDC</span>
                  </div>
                </div>

                {/* Speed toggle */}
                <div style={{ display: "flex", justifyContent: "center", gap: "8px" }}>
                  <button
                    onClick={() => setSpeed("fast")}
                    style={{
                      padding: "8px 24px",
                      fontSize: "13px",
                      fontWeight: speed === "fast" ? 700 : 400,
                      backgroundColor: speed === "fast" ? "rgba(255,254,178,0.1)" : "rgba(255,255,255,0.04)",
                      color: speed === "fast" ? "#fffeb2" : "rgba(255,255,255,0.4)",
                      border: speed === "fast" ? "1px solid rgba(255,254,178,0.3)" : "1px solid rgba(255,255,255,0.08)",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      transition: "all 0.15s ease",
                    }}
                  >
                    Fast
                  </button>
                  <button
                    onClick={() => setSpeed("thorough")}
                    style={{
                      padding: "8px 24px",
                      fontSize: "13px",
                      fontWeight: speed === "thorough" ? 700 : 400,
                      backgroundColor: speed === "thorough" ? "rgba(255,254,178,0.12)" : "rgba(255,255,255,0.04)",
                      color: speed === "thorough" ? "#fffeb2" : "rgba(255,255,255,0.4)",
                      border: speed === "thorough" ? "1px solid rgba(255,254,178,0.35)" : "1px solid rgba(255,255,255,0.08)",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      transition: "all 0.15s ease",
                    }}
                  >
                    Thorough
                  </button>
                </div>
              </div>

              <button
                onClick={startAutonomous}
                style={{
                  padding: "16px 56px",
                  fontSize: "15px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  backgroundColor: "#fffeb2",
                  color: "#000000",
                  border: "none",
                  borderRadius: "10px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.2s ease",
                }}
              >
                RELEASE AGENT
              </button>
            </>
          )}

          {running && (
            <div>
              <div style={{ fontSize: "15px", fontWeight: 600, color: "#fffeb2", marginBottom: "14px", fontFamily: "inherit" }}>
                RUNNING &mdash; ROUND {currentRound}/{totalRoundsMax}
              </div>
              {/* Progress bar */}
              <div style={{
                width: "100%",
                height: "6px",
                backgroundColor: "rgba(255,255,255,0.1)",
                borderRadius: "3px",
                overflow: "hidden",
              }}>
                <div style={{
                  width: `${progressPercent}%`,
                  height: "100%",
                  backgroundColor: "#fffeb2",
                  borderRadius: "3px",
                  transition: "width 0.5s ease",
                }} />
              </div>
            </div>
          )}

          {done && !running && (
            <div>
              <div style={{ fontSize: "15px", fontWeight: 600, color: "rgba(255,255,255,0.45)", marginBottom: "14px", fontFamily: "inherit" }}>
                MISSION COMPLETE
              </div>
              <button
                onClick={() => {
                  setDone(false);
                  setLogs([]);
                  setJobsCompleted(0);
                  setTotalEarned(0);
                  setElapsedTime(0);
                  setCurrentRound(0);
                  setPipelineStep(null);
                  setCompletedSteps(new Set());
                  setActiveJob(null);
                  setCompletedJobs([]);
                  setRoundEarnings([]);
                  setHistory(loadHistory());
                }}
                style={{
                  padding: "12px 36px",
                  fontSize: "14px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  backgroundColor: "#fffeb2",
                  color: "#000000",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                NEW MISSION
              </button>
            </div>
          )}
        </div>

        {/* Phase 4: Earnings Graph */}
        {roundEarnings.length > 0 && (
          <div style={{
            backgroundColor: "rgba(0,0,0,0.4)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "12px",
            padding: "24px",
            backdropFilter: "blur(12px)",
            marginBottom: "24px",
          }}>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "20px", fontFamily: "inherit" }}>
              Earnings Per Round
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: "12px", height: "120px" }}>
              {roundEarnings.map((earning, i) => {
                const heightPercent = Math.max((earning / maxEarning) * 100, 8);
                return (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", flex: "0 1 60px" }}>
                    <span style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#fffeb2",
                      fontFamily: "inherit",
                    }}>
                      {earning > 0 ? `${earning.toFixed(0)}` : "0"}
                    </span>
                    <div style={{
                      width: "36px",
                      height: `${heightPercent}%`,
                      backgroundColor: "#fffeb2",
                      borderRadius: "4px 4px 2px 2px",
                      animation: "bar-grow 0.6s ease-out",
                      transformOrigin: "bottom",
                      minHeight: "8px",
                    }} />
                    <span style={{
                      fontSize: "11px",
                      color: "rgba(255,255,255,0.3)",
                      fontFamily: "inherit",
                    }}>
                      R{i + 1}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Cumulative Dashboard (done) */}
        {done && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "12px",
            marginBottom: "24px",
          }}>
            {[
              { label: "Rounds", value: String(totalRoundsMax), color: "rgba(255,255,255,0.7)" },
              { label: "Jobs Done", value: String(jobsCompleted), color: "#fffeb2" },
              { label: "USDC Earned", value: totalEarned.toFixed(0), color: "#fffeb2" },
              { label: "Avg/Round", value: avgTimePerRound > 0 ? `${avgTimePerRound.toFixed(1)}s` : `${(elapsedTime / Math.max(1, totalRoundsMax)).toFixed(1)}s`, color: "rgba(255,255,255,0.5)" },
            ].map((stat, i) => (
              <div
                key={i}
                style={{
                  backgroundColor: "rgba(0,0,0,0.4)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "10px",
                  padding: "20px",
                  textAlign: "center",
                  backdropFilter: "blur(12px)",
                }}
              >
                <div style={{ fontSize: "28px", fontWeight: 700, color: stat.color, fontFamily: "inherit" }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: "6px", fontFamily: "inherit" }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Activity Log (Terminal) — Collapsible */}
        {logs.length > 0 && (
          <div style={{
            backgroundColor: "rgba(0,0,0,0.6)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "12px",
            overflow: "hidden",
            marginBottom: "24px",
          }}>
            {/* Terminal header — clickable to toggle */}
            <div
              onClick={() => setTerminalOpen((prev) => !prev)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "12px 16px",
                backgroundColor: "rgba(255,255,255,0.04)",
                borderBottom: terminalOpen ? "1px solid rgba(255,255,255,0.06)" : "none",
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              <div style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#ff5f57" }} />
              <div style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#febc2e" }} />
              <div style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#28c840" }} />
              <span style={{ marginLeft: "8px", fontSize: "12px", color: "rgba(255,255,255,0.3)", letterSpacing: "0.05em", fontFamily: "'SF Mono', Monaco, 'Cascadia Code', monospace" }}>
                autonomous-agent-omega
              </span>
              <span style={{ marginLeft: "auto", fontSize: "13px", color: "rgba(255,255,255,0.25)", fontFamily: "inherit" }}>
                {terminalOpen ? "\u25B2" : "\u25BC"} {logs.length} events
              </span>
            </div>
            {/* Log content */}
            {terminalOpen && (
              <div
                ref={logPanelRef}
                style={{
                  maxHeight: "400px",
                  overflowY: "auto",
                  padding: "14px 16px",
                  fontFamily: "'SF Mono', Monaco, 'Cascadia Code', monospace",
                  fontSize: "13px",
                  lineHeight: 1.8,
                }}
              >
                {logs.map((entry, i) => {
                  const isRoundStart = entry.event.step === "auto_round_start";
                  const isRoundEnd = entry.event.step === "auto_round_end";
                  const roundNum = entry.event.data ? Number(entry.event.data.round || 0) : 0;
                  return (
                    <div key={i}>
                      {isRoundStart && roundNum > 1 ? (
                        <div style={{ color: "rgba(255,255,255,0.15)", padding: "4px 0", textAlign: "center", letterSpacing: "0.3em" }}>
                          {`\u2550\u2550\u2550 ROUND ${roundNum} \u2550\u2550\u2550`}
                        </div>
                      ) : null}
                      {isRoundStart && roundNum === 1 ? (
                        <div style={{ color: "rgba(255,255,255,0.15)", padding: "4px 0", textAlign: "center", letterSpacing: "0.3em" }}>
                          {`\u2550\u2550\u2550 ROUND 1 \u2550\u2550\u2550`}
                        </div>
                      ) : null}
                      <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                        <span style={{ color: "rgba(255,255,255,0.2)", flexShrink: 0 }}>{entry.timestamp}</span>
                        <span style={{
                          width: "6px",
                          height: "6px",
                          borderRadius: "50%",
                          backgroundColor: getEventColor(entry.event.step),
                          flexShrink: 0,
                          marginTop: "7px",
                        }} />
                        <span style={{ color: getEventColor(entry.event.step) }}>
                          {entry.event.message}
                          {entry.event.data?.txHash ? (
                            <a
                              href={`https://explorer.solana.com/tx/${String(entry.event.data.txHash)}?cluster=devnet`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: "rgba(255,255,255,0.2)", marginLeft: "6px", textDecoration: "none", fontSize: "12px" }}
                            >
                              [tx]
                            </a>
                          ) : null}
                          {entry.event.data?.submitTxHash ? (
                            <a
                              href={`https://explorer.solana.com/tx/${String(entry.event.data.submitTxHash)}?cluster=devnet`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: "rgba(255,255,255,0.2)", marginLeft: "6px", textDecoration: "none", fontSize: "12px" }}
                            >
                              [tx]
                            </a>
                          ) : null}
                          {entry.event.data?.amount ? (
                            <span style={{ color: "#fffeb2", marginLeft: "6px" }}>
                              +{String(entry.event.data.amount)} USDC
                            </span>
                          ) : null}
                        </span>
                      </div>
                      {isRoundEnd && (
                        <div style={{ color: "rgba(255,255,255,0.1)", padding: "2px 0" }}>&nbsp;</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Phase 6: Past Missions (Run History) */}
        {history.length > 0 && (
          <div style={{
            backgroundColor: "rgba(0,0,0,0.4)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "12px",
            padding: "24px",
            backdropFilter: "blur(12px)",
            marginBottom: "24px",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "inherit" }}>
                Past Missions
              </div>
              <button
                onClick={clearHistory}
                style={{
                  padding: "5px 12px",
                  fontSize: "11px",
                  fontWeight: 500,
                  backgroundColor: "rgba(255,255,255,0.05)",
                  color: "rgba(255,255,255,0.3)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.15s ease",
                }}
              >
                Clear History
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {[...history].reverse().map((run, i) => {
                const d = new Date(run.date);
                const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                const timeStr = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
                return (
                  <div key={i} style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                    backgroundColor: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: "8px",
                    flexWrap: "wrap",
                    gap: "8px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", fontFamily: "inherit", minWidth: "90px" }}>
                        {dateStr} {timeStr}
                      </span>
                      <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", fontFamily: "inherit" }}>
                        {run.rounds} rounds
                      </span>
                      <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", fontFamily: "inherit" }}>
                        {run.jobsCompleted} jobs
                      </span>
                      <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.35)", fontFamily: "inherit" }}>
                        {formatDuration(run.duration)}
                      </span>
                    </div>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "#fffeb2", fontFamily: "inherit" }}>
                      {run.earned > 0 ? `+${run.earned.toFixed(0)} USDC` : "0 USDC"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
