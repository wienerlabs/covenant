"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import NavBar from "@/components/NavBar";
import PixelAgent from "@/components/PixelAgent";
import EscrowVisualizer from "@/components/EscrowVisualizer";
import { USDC_LOGO_URL, SOL_LOGO_URL } from "@/lib/constants";
import { getCategoryById } from "@/lib/categories";
import { fireConfetti } from "@/lib/confetti";
import DIDBadge from "@/components/DIDBadge";

interface ArenaEvent {
  step: string;
  message: string;
  data: Record<string, unknown> | null;
}

interface LogEntry {
  timestamp: string;
  event: ArenaEvent;
}

type AgentState = "idle" | "thinking" | "working" | "celebrating";

const AGENT_ALPHA_CONFIG = {
  name: "AGENT ALPHA",
  role: "POSTER",
  wallet: process.env.NEXT_PUBLIC_AGENT_ALPHA_WALLET || "GMCRqvQyyu5WvoaWF4apE1A39W5SaoXUJkGkdvHpGQ9v",
  color: "#42BDFF",
  avatarSeed: "agent-alpha-covenant-2026",
};

const AGENT_OMEGA_CONFIG = {
  name: "AGENT OMEGA",
  role: "TAKER",
  wallet: process.env.NEXT_PUBLIC_AGENT_OMEGA_WALLET || "55EbEM7x6WQxVFSt1KennwYBPgWF7GgF5bd2R2FVxiw1",
  color: "#FF425E",
  avatarSeed: "agent-omega-covenant-2026",
};

function getTimestamp(): string {
  return new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function truncateWallet(addr: string): string {
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

interface MultiRoundSummary {
  totalRounds: number;
  totalJobs: number;
  totalUsdc: number;
  totalTx: number;
  avgTimePerRound: number;
}

interface OpenJob {
  id: string;
  amount: number;
  category: string;
  minWords: number;
  deadline: string;
  posterWallet: string;
  specJson: Record<string, unknown>;
  status: string;
}

export default function ArenaPage() {
  const [running, setRunning] = useState(false);
  const [round, setRound] = useState(0);
  const [selectedRounds, setSelectedRounds] = useState(1);
  const [currentRoundOf, setCurrentRoundOf] = useState(0);
  const [multiRoundSummary, setMultiRoundSummary] = useState<MultiRoundSummary | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [alphaState, setAlphaState] = useState<AgentState>("idle");
  const [omegaState, setOmegaState] = useState<AgentState>("idle");
  const [alphaThought, setAlphaThought] = useState<string | null>(null);
  const [omegaThought, setOmegaThought] = useState<string | null>(null);
  const [alphaActions, setAlphaActions] = useState<string[]>([]);
  const [omegaActions, setOmegaActions] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [buttonHover, setButtonHover] = useState(false);
  const [copiedAlpha, setCopiedAlpha] = useState(false);
  const [copiedOmega, setCopiedOmega] = useState(false);
  const [jobData, setJobData] = useState<Record<string, unknown> | null>(null);
  const [specData, setSpecData] = useState<Record<string, unknown> | null>(null);
  const [zkData, setZkData] = useState<Record<string, unknown> | null>(null);
  const [deliverablePreview, setDeliverablePreview] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<"idle" | "created" | "accepted" | "completed">("idle");
  const [perfTimestamps, setPerfTimestamps] = useState<{ [key: string]: number }>({});
  const [perfMetrics, setPerfMetrics] = useState<{
    alphaResponseTime: number | null;
    omegaResponseTime: number | null;
    totalRoundTime: number | null;
  } | null>(null);
  const [transactions, setTransactions] = useState<{label: string; txHash: string}[]>([]);
  const [x402Payments, setX402Payments] = useState<{from: string; to: string; amount: number; memo: string; txHash: string}[]>([]);
  const [chatMessages, setChatMessages] = useState<{agent: string; message: string; timestamp: string}[]>([]);
  const [escrowPhase, setEscrowPhase] = useState<"idle" | "locking" | "locked" | "releasing" | "released">("idle");
  const [escrowAmount, setEscrowAmount] = useState(0);
  const [a2aMessages, setA2aMessages] = useState<{method: string; params: Record<string, unknown>; did: string; timestamp: string}[]>([]);
  const [a2aExpanded, setA2aExpanded] = useState(true);
  const logPanelRef = useRef<HTMLDivElement>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);

  // ===== Fulfill mode state =====
  const [arenaMode, setArenaMode] = useState<"new" | "fulfill">("new");
  const [openJobs, setOpenJobs] = useState<OpenJob[]>([]);
  const [openJobsLoading, setOpenJobsLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState<OpenJob | null>(null);

  useEffect(() => {
    if (logPanelRef.current) {
      logPanelRef.current.scrollTop = logPanelRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    if (chatPanelRef.current) {
      chatPanelRef.current.scrollTop = chatPanelRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleEvent = useCallback((event: ArenaEvent) => {
    setLogs((prev) => [...prev, { timestamp: getTimestamp(), event }]);

    // Track timestamps for performance metrics
    setPerfTimestamps((prev) => ({ ...prev, [event.step]: Date.now() }));

    switch (event.step) {
      case "alpha_thinking":
        setAlphaState("thinking");
        setAlphaThought("Generating job specification...");
        setAlphaActions((prev) => [...prev, "Thinking..."]);
        break;
      case "alpha_thought":
        setAlphaState("working");
        setAlphaThought(
          `Job: ${event.data?.title}\nCategory: ${event.data?.categoryTag}\nAmount: ${event.data?.amount} USDC\nMin Words: ${event.data?.minWords}`
        );
        setAlphaActions((prev) => {
          const next = [...prev];
          next[next.length - 1] = `Generated: ${event.data?.title}`;
          return next;
        });
        if (event.data) {
          setSpecData({ ...event.data });
        }
        break;
      case "job_created":
        setAlphaState("celebrating");
        setAlphaActions((prev) => [
          ...prev,
          `Job created (${String(event.data?.jobId).slice(0, 8)}...)`,
        ]);
        if (event.data) {
          setJobData({ ...event.data });
          setJobStatus("created");
          if (typeof event.data.txHash === "string") {
            setTransactions((prev) => [...prev, { label: "Create Job", txHash: event.data!.txHash as string }]);
          }
        }
        setTimeout(() => setAlphaState("idle"), 2000);
        break;
      case "omega_thinking":
        setOmegaState("thinking");
        setOmegaThought("Evaluating job opportunity...");
        setOmegaActions((prev) => [...prev, "Evaluating..."]);
        break;
      case "omega_accepted":
        setOmegaState("celebrating");
        setOmegaThought(`Accepted: ${event.data?.reason}`);
        setOmegaActions((prev) => {
          const next = [...prev];
          next[next.length - 1] = "Job accepted";
          return next;
        });
        setJobStatus("accepted");
        if (event.data && typeof event.data.txHash === "string") {
          setTransactions((prev) => [...prev, { label: "Accept Job", txHash: event.data!.txHash as string }]);
        }
        setTimeout(() => setOmegaState("idle"), 1000);
        break;
      case "omega_working":
        setOmegaState("working");
        setOmegaThought("Generating deliverable...");
        setOmegaActions((prev) => [...prev, "Working on deliverable..."]);
        break;
      case "omega_completed":
        setOmegaState("celebrating");
        setOmegaThought(
          `Submitted: ${event.data?.wordCount} words\nHash: ${event.data?.textHash}...`
        );
        setOmegaActions((prev) => {
          const next = [...prev];
          next[next.length - 1] = `Submitted (${event.data?.wordCount} words)`;
          return next;
        });
        if (event.data) {
          setZkData({ ...event.data });
          setDeliverablePreview(typeof event.data.textPreview === "string" ? event.data.textPreview : null);
          setJobStatus("completed");
          if (typeof event.data.txHash === "string") {
            setTransactions((prev) => [...prev, { label: "Submit Work", txHash: event.data!.txHash as string }]);
          }
        }
        break;
      case "agent_chat":
        if (event.data) {
          setChatMessages((prev) => [...prev, {
            agent: String(event.data!.agent || ""),
            message: String(event.data!.message || ""),
            timestamp: getTimestamp(),
          }]);
        }
        break;
      case "a2a_message":
        if (event.data) {
          setA2aMessages((prev) => [...prev, {
            method: String(event.data!.method || ""),
            params: (event.data!.params || {}) as Record<string, unknown>,
            did: String(event.data!.did || ""),
            timestamp: getTimestamp(),
          }]);
        }
        break;
      case "escrow_lock":
        setAlphaState("working");
        setAlphaActions((prev) => [...prev, "Locking funds in escrow..."]);
        setEscrowPhase("locking");
        if (event.data?.amount) setEscrowAmount(Number(event.data.amount));
        break;
      case "escrow_locked":
        setAlphaState("celebrating");
        setAlphaActions((prev) => {
          const next = [...prev];
          next[next.length - 1] = `Escrow locked: ${event.data?.amount} USDC`;
          return next;
        });
        if (event.data && typeof event.data.txHash === "string") {
          setTransactions((prev) => [...prev, { label: "Escrow Lock (SPL)", txHash: event.data!.txHash as string }]);
        }
        setEscrowPhase("locked");
        if (event.data?.amount) setEscrowAmount(Number(event.data.amount));
        setTimeout(() => setAlphaState("idle"), 800);
        break;
      case "escrow_release":
        setOmegaState("working");
        setOmegaActions((prev) => [...prev, "Releasing escrow payment..."]);
        setEscrowPhase("releasing");
        break;
      case "escrow_released":
        setOmegaState("celebrating");
        setOmegaActions((prev) => {
          const next = [...prev];
          next[next.length - 1] = `Payment received: ${event.data?.amount} USDC`;
          return next;
        });
        if (event.data && typeof event.data.txHash === "string") {
          setTransactions((prev) => [...prev, { label: "Escrow Release (SPL)", txHash: event.data!.txHash as string }]);
        }
        setEscrowPhase("released");
        setTimeout(() => setOmegaState("idle"), 800);
        break;
      case "x402_payment":
        if (event.data) {
          setX402Payments((prev) => [...prev, {
            from: String(event.data!.from || ""),
            to: String(event.data!.to || ""),
            amount: Number(event.data!.amount || 0),
            memo: String(event.data!.memo || ""),
            txHash: String(event.data!.txHash || ""),
          }]);
          if (typeof event.data.txHash === "string") {
            setTransactions((prev) => [...prev, { label: `x402: ${String(event.data!.memo || "")}`, txHash: event.data!.txHash as string }]);
          }
          // Determine which agent is paying and flash working state
          const fromAddr = String(event.data.from || "");
          if (fromAddr === AGENT_OMEGA_CONFIG.wallet) {
            setOmegaState("working");
            setOmegaActions((prev) => [...prev, `x402 payment: ${event.data!.memo}`]);
            setTimeout(() => setOmegaState("idle"), 800);
          } else if (fromAddr === AGENT_ALPHA_CONFIG.wallet) {
            setAlphaState("working");
            setAlphaActions((prev) => [...prev, `x402 payment: ${event.data!.memo}`]);
            setTimeout(() => setAlphaState("idle"), 800);
          }
        }
        break;
      // ===== Fulfill mode events =====
      case "fulfill_start":
        setOmegaState("thinking");
        setOmegaThought("Discovering open job...");
        setOmegaActions((prev) => [...prev, "Scanning open jobs..."]);
        if (event.data?.title) {
          setSpecData({ ...event.data });
          setAlphaThought(`Posted: ${event.data.title}\nAmount: ${event.data.amount} USDC`);
          setAlphaState("idle");
        }
        break;
      case "fulfill_accept":
        setOmegaState("working");
        setOmegaThought("Accepting job...");
        setOmegaActions((prev) => {
          const next = [...prev];
          if (next.length > 0 && next[next.length - 1].includes("Scanning")) {
            next[next.length - 1] = "Job found — accepting";
          } else {
            next.push("Job accepted");
          }
          return next;
        });
        setJobStatus("accepted");
        if (event.data && typeof event.data.txHash === "string") {
          setTransactions((prev) => [...prev, { label: "Accept Job", txHash: event.data!.txHash as string }]);
        }
        break;
      case "fulfill_working":
        setOmegaState("thinking");
        setOmegaThought("Generating deliverable with Haiku...");
        setOmegaActions((prev) => [...prev, "Working on deliverable..."]);
        if (event.data?.textPreview) {
          setDeliverablePreview(String(event.data.textPreview));
        }
        break;
      case "fulfill_circuit":
        setOmegaState("working");
        setOmegaThought(`ZK circuit: ${event.data?.verified ? "VERIFIED" : "checking..."}\nWords: ${event.data?.wordCount || "..."}`);
        if (event.data) {
          setZkData({ ...event.data });
        }
        setOmegaActions((prev) => {
          const next = [...prev];
          if (next.length > 0 && next[next.length - 1].includes("Working")) {
            next[next.length - 1] = `ZK verified: ${event.data?.wordCount} words`;
          } else {
            next.push(`ZK verified: ${event.data?.wordCount} words`);
          }
          return next;
        });
        break;
      case "fulfill_submit":
        setOmegaState("celebrating");
        setOmegaThought(`Submitted: ${event.data?.wordCount || ""} words\nHash: ${event.data?.textHash || ""}...`);
        setOmegaActions((prev) => [...prev, `Submitted (${event.data?.wordCount} words)`]);
        setJobStatus("completed");
        if (event.data && typeof event.data.txHash === "string") {
          setTransactions((prev) => [...prev, { label: "Submit Work", txHash: event.data!.txHash as string }]);
        }
        break;
      case "fulfill_complete":
        setOmegaState("celebrating");
        setAlphaState("celebrating");
        fireConfetti();
        setOmegaActions((prev) => [...prev, "Job fulfilled!"]);
        break;
      case "complete":
        setAlphaState("celebrating");
        setOmegaState("celebrating");
        fireConfetti();
        // Compute perf metrics
        setPerfTimestamps((prev) => {
          const now = Date.now();
          const ts: { [key: string]: number } = { ...prev, complete: now };
          const alphaResp = ts["job_created"] && ts["alpha_thinking"] ? ts["job_created"] - ts["alpha_thinking"] : null;
          const omegaResp = ts["omega_completed"] && ts["omega_thinking"] ? ts["omega_completed"] - ts["omega_thinking"] : null;
          const totalTime = ts["alpha_thinking"] ? now - ts["alpha_thinking"] : null;
          setPerfMetrics({
            alphaResponseTime: alphaResp,
            omegaResponseTime: omegaResp,
            totalRoundTime: totalTime,
          });
          return ts;
        });
        setTimeout(() => {
          setAlphaState("idle");
          setOmegaState("idle");
        }, 3000);
        break;
      case "error":
        setAlphaState("idle");
        setOmegaState("idle");
        break;
    }
  }, []);

  async function runSingleRound(): Promise<{ jobCount: number; usdcTotal: number; txCount: number }> {
    let jobCount = 0;
    let usdcTotal = 0;
    let txCount = 0;

    setLogs([]);
    setAlphaThought(null);
    setOmegaThought(null);
    setAlphaActions([]);
    setOmegaActions([]);
    setAlphaState("idle");
    setOmegaState("idle");
    setJobData(null);
    setSpecData(null);
    setZkData(null);
    setDeliverablePreview(null);
    setJobStatus("idle");
    setTransactions([]);
    setX402Payments([]);
    setChatMessages([]);
    setA2aMessages([]);
    setEscrowPhase("idle");
    setEscrowAmount(0);
    setPerfTimestamps({});
    setPerfMetrics(null);

    try {
      const response = await fetch("/api/arena/run", { method: "POST" });

      if (!response.ok || !response.body) {
        handleEvent({
          step: "error",
          message: "Failed to start arena: " + response.statusText,
          data: null,
        });
        return { jobCount, usdcTotal, txCount };
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
            const event: ArenaEvent = JSON.parse(trimmed);
            handleEvent(event);
            if (event.step === "job_created") { jobCount++; usdcTotal += Number(event.data?.amount || 0); }
            if (event.data && typeof event.data.txHash === "string") { txCount++; }
            if (event.step === "complete" || event.step === "error") {
              setDone(true);
            }
          } catch {
            // Skip malformed lines
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const event: ArenaEvent = JSON.parse(buffer.trim());
          handleEvent(event);
          if (event.step === "job_created") { jobCount++; usdcTotal += Number(event.data?.amount || 0); }
          if (event.data && typeof event.data.txHash === "string") { txCount++; }
          if (event.step === "complete" || event.step === "error") {
            setDone(true);
          }
        } catch {
          // Skip
        }
      }
    } catch (err) {
      handleEvent({
        step: "error",
        message: "Arena error: " + String(err),
        data: null,
      });
    }

    return { jobCount, usdcTotal, txCount };
  }

  async function runArena() {
    setRunning(true);
    setDone(false);
    setMultiRoundSummary(null);
    setRound((prev) => prev + 1);

    const totalRounds = selectedRounds;
    let totalJobs = 0;
    let totalUsdc = 0;
    let totalTx = 0;
    const startTime = Date.now();

    for (let r = 1; r <= totalRounds; r++) {
      setCurrentRoundOf(r);
      const result = await runSingleRound();
      totalJobs += result.jobCount;
      totalUsdc += result.usdcTotal;
      totalTx += result.txCount;
    }

    const elapsed = Date.now() - startTime;
    const avgTime = elapsed / totalRounds;

    if (totalRounds > 1) {
      setMultiRoundSummary({
        totalRounds,
        totalJobs,
        totalUsdc,
        totalTx,
        avgTimePerRound: avgTime,
      });
    }

    setCurrentRoundOf(0);
    setRunning(false);
    setDone(true);
  }

  // ===== Fetch open jobs for fulfill mode =====
  async function fetchOpenJobs() {
    setOpenJobsLoading(true);
    try {
      const res = await fetch("/api/jobs?status=Open&limit=20&sortBy=createdAt&sortOrder=desc");
      if (res.ok) {
        const data = await res.json();
        setOpenJobs(Array.isArray(data) ? data : (data.jobs || []));
      }
    } catch {
      // silent
    } finally {
      setOpenJobsLoading(false);
    }
  }

  useEffect(() => {
    if (arenaMode === "fulfill") {
      fetchOpenJobs();
    }
  }, [arenaMode]);

  // ===== Run fulfillment =====
  async function runFulfillment() {
    if (!selectedJob) return;
    setRunning(true);
    setDone(false);
    setMultiRoundSummary(null);
    setRound((prev) => prev + 1);

    // Reset state
    setLogs([]);
    setAlphaThought(null);
    setOmegaThought(null);
    setAlphaActions([]);
    setOmegaActions([]);
    setAlphaState("idle");
    setOmegaState("idle");
    setJobData(null);
    setSpecData(null);
    setZkData(null);
    setDeliverablePreview(null);
    setJobStatus("idle");
    setTransactions([]);
    setX402Payments([]);
    setChatMessages([]);
    setA2aMessages([]);
    setEscrowPhase("idle");
    setEscrowAmount(0);
    setPerfTimestamps({});
    setPerfMetrics(null);

    // Set initial job data from selected job
    setJobData({
      jobId: selectedJob.id,
      title: String(selectedJob.specJson?.title || ""),
      amount: selectedJob.amount,
      category: selectedJob.category,
    });
    setSpecData({
      title: String(selectedJob.specJson?.title || ""),
      description: String(selectedJob.specJson?.description || ""),
      amount: selectedJob.amount,
      minWords: selectedJob.minWords,
      category: selectedJob.category,
    });
    setJobStatus("created");
    setEscrowAmount(selectedJob.amount);

    try {
      const response = await fetch("/api/arena/fulfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: selectedJob.id }),
      });

      if (!response.ok || !response.body) {
        handleEvent({
          step: "error",
          message: "Failed to start fulfillment: " + response.statusText,
          data: null,
        });
        setRunning(false);
        setDone(true);
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
            const event: ArenaEvent = JSON.parse(trimmed);
            handleEvent(event);
            if (event.step === "complete" || event.step === "error") {
              setDone(true);
            }
          } catch {
            // Skip malformed lines
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const event: ArenaEvent = JSON.parse(buffer.trim());
          handleEvent(event);
          if (event.step === "complete" || event.step === "error") {
            setDone(true);
          }
        } catch {
          // Skip
        }
      }
    } catch (err) {
      handleEvent({
        step: "error",
        message: "Fulfillment error: " + String(err),
        data: null,
      });
    }

    setRunning(false);
    setDone(true);
    // Refresh open jobs list
    fetchOpenJobs();
  }

  function copyWallet(wallet: string, agent: "alpha" | "omega") {
    navigator.clipboard.writeText(wallet);
    if (agent === "alpha") {
      setCopiedAlpha(true);
      setTimeout(() => setCopiedAlpha(false), 1500);
    } else {
      setCopiedOmega(true);
      setTimeout(() => setCopiedOmega(false), 1500);
    }
  }

  function getEventDotColor(step: string): string {
    if (step === "a2a_message") return "#feffaf";
    if (step === "x402_payment") return "#f59e0b";
    if (step.startsWith("escrow_")) return "#FFE342";
    if (step.includes("error")) return "#ff5f57";
    if (step === "complete" || step.includes("completed") || step.includes("accepted")) return "#FFE342";
    if (step.includes("created")) return "#FFE342";
    if (step.includes("thinking") || step.includes("working")) return "#5ba4f5";
    if (step.includes("thought")) return "#42BDFF";
    return "#5ba4f5";
  }

  function getEventTextColor(step: string): string {
    if (step === "a2a_message") return "#feffaf";
    if (step === "x402_payment") return "#f59e0b";
    if (step.startsWith("escrow_")) return "#FFE342";
    if (step.includes("error")) return "#fca5a5";
    if (step === "complete" || step.includes("completed")) return "#FFE342";
    if (step.includes("accepted") || step.includes("created")) return "#42BDFF";
    return "rgba(255,255,255,0.85)";
  }

  // Render agent panel
  function renderAgentPanel(
    config: typeof AGENT_ALPHA_CONFIG,
    state: AgentState,
    thought: string | null,
    actions: string[],
    copied: boolean,
    agentKey: "alpha" | "omega"
  ) {
    return (
      <div
        style={{
          backgroundColor: "rgba(0,0,0,0.4)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderLeft: `3px solid ${config.color}`,
          borderRadius: "10px",
          padding: "20px",
          backdropFilter: "blur(12px)",
          flex: 1,
          minWidth: 0,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px" }}>
          <PixelAgent seed={config.avatarSeed} color={config.color} size={64} state={state} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <span style={{ fontSize: "14px", fontWeight: 700, color: "#ffffff", letterSpacing: "0.02em" }}>
                {config.name}
              </span>
              <span
                style={{
                  fontSize: "9px",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  backgroundColor: `${config.color}25`,
                  color: config.color,
                  border: `1px solid ${config.color}40`,
                  fontWeight: 600,
                }}
              >
                {config.role}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "10px",
                color: "rgba(255,255,255,0.4)",
              }}
            >
              <span style={{ fontFamily: "monospace" }}>{truncateWallet(config.wallet)}</span>
              <button
                onClick={() => copyWallet(config.wallet, agentKey)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "2px 4px",
                  fontSize: "9px",
                  color: copied ? "#FFE342" : "rgba(255,255,255,0.3)",
                  transition: "color 0.15s ease",
                }}
              >
                {copied ? "COPIED" : "COPY"}
              </button>
            </div>
            <div style={{ marginTop: "4px" }}>
              <DIDBadge walletAddress={config.wallet} compact />
            </div>
            <div style={{ marginTop: "4px" }}>
              <span
                style={{
                  fontSize: "9px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: state === "idle" ? "rgba(255,255,255,0.3)" : config.color,
                  fontWeight: state === "idle" ? 400 : 600,
                }}
              >
                {state === "idle" ? "STANDBY" : state.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* Thought bubble */}
        {thought && (
          <div
            style={{
              backgroundColor: `${config.color}10`,
              border: `1px solid ${config.color}30`,
              borderRadius: "8px",
              padding: "10px 12px",
              marginBottom: "12px",
              fontSize: "11px",
              color: "rgba(255,255,255,0.8)",
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "-6px",
                left: "20px",
                width: "10px",
                height: "10px",
                backgroundColor: `${config.color}10`,
                border: `1px solid ${config.color}30`,
                borderRight: "none",
                borderBottom: "none",
                transform: "rotate(45deg)",
              }}
            />
            {thought}
          </div>
        )}

        {/* Action log */}
        <div
          style={{
            maxHeight: "120px",
            overflowY: "auto",
            fontSize: "10px",
            color: "rgba(255,255,255,0.5)",
          }}
        >
          {actions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "12px 0", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Waiting for arena start...
            </div>
          ) : (
            actions.map((action, i) => (
              <div
                key={i}
                style={{
                  padding: "3px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span
                  style={{
                    width: "4px",
                    height: "4px",
                    borderRadius: "50%",
                    backgroundColor: config.color,
                    flexShrink: 0,
                  }}
                />
                {action}
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", fontFamily: "inherit", position: "relative" }}>
      {/* Background */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          backgroundImage: "url('/poster-bg.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      />
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1,
          backgroundColor: "rgba(0, 0, 0, 0.55)",
        }}
      />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 2 }}>
        <NavBar activeTab="arena" variant="dark" />

        <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "32px 24px" }}>
          {/* Title */}
          <h1
            style={{
              fontSize: "28px",
              fontWeight: 700,
              color: "#ffffff",
              textTransform: "uppercase",
              letterSpacing: "-0.01em",
              margin: "0 0 4px 0",
              textAlign: "center",
            }}
          >
            Agent Arena
          </h1>
          <p
            style={{
              fontSize: "13px",
              color: "rgba(255,255,255,0.5)",
              margin: "0 0 24px 0",
              textAlign: "center",
            }}
          >
            Watch AI agents autonomously negotiate, deliver, and settle on-chain
          </p>

          {/* Mode Toggle */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "8px",
              marginBottom: "20px",
            }}
          >
            <button
              onClick={() => !running && setArenaMode("new")}
              disabled={running}
              style={{
                fontFamily: "inherit",
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                padding: "8px 20px",
                cursor: running ? "not-allowed" : "pointer",
                border: arenaMode === "new" ? "1px solid #42BDFF" : "1px solid rgba(255,255,255,0.2)",
                borderRadius: "6px",
                backgroundColor: arenaMode === "new" ? "rgba(66,189,255,0.15)" : "transparent",
                color: arenaMode === "new" ? "#42BDFF" : "rgba(255,255,255,0.5)",
                fontWeight: arenaMode === "new" ? 700 : 400,
                transition: "all 0.15s ease",
              }}
            >
              New Job
            </button>
            <button
              onClick={() => !running && setArenaMode("fulfill")}
              disabled={running}
              style={{
                fontFamily: "inherit",
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                padding: "8px 20px",
                cursor: running ? "not-allowed" : "pointer",
                border: arenaMode === "fulfill" ? "1px solid #FF425E" : "1px solid rgba(255,255,255,0.2)",
                borderRadius: "6px",
                backgroundColor: arenaMode === "fulfill" ? "rgba(255,66,94,0.15)" : "transparent",
                color: arenaMode === "fulfill" ? "#FF425E" : "rgba(255,255,255,0.5)",
                fontWeight: arenaMode === "fulfill" ? 700 : 400,
                transition: "all 0.15s ease",
              }}
            >
              Fulfill Open Job
            </button>
          </div>

          {/* Fulfill Mode: Job Selector */}
          {arenaMode === "fulfill" && !running && !done && (
            <div
              style={{
                backgroundColor: "rgba(0,0,0,0.4)",
                border: "1px solid rgba(255,66,94,0.25)",
                borderRadius: "10px",
                padding: "20px",
                backdropFilter: "blur(12px)",
                marginBottom: "24px",
              }}
            >
              <div
                style={{
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "#FF425E",
                  marginBottom: "16px",
                  fontWeight: 600,
                }}
              >
                Select an Open Job to Fulfill
              </div>
              {openJobsLoading ? (
                <div style={{ textAlign: "center", padding: "20px 0", fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>
                  Loading open jobs...
                </div>
              ) : openJobs.length === 0 ? (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginBottom: "8px" }}>No open jobs available</div>
                  <button
                    onClick={fetchOpenJobs}
                    style={{
                      fontFamily: "inherit",
                      fontSize: "10px",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      padding: "6px 16px",
                      cursor: "pointer",
                      border: "1px solid rgba(255,255,255,0.2)",
                      borderRadius: "4px",
                      backgroundColor: "transparent",
                      color: "rgba(255,255,255,0.5)",
                    }}
                  >
                    Refresh
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "280px", overflowY: "auto" }}>
                  {openJobs.map((oj) => {
                    const ojTitle = String(oj.specJson?.title || `Job ${oj.id.slice(0, 8)}`);
                    const ojCat = getCategoryById(oj.category || "text_writing");
                    const isSelected = selectedJob?.id === oj.id;
                    return (
                      <div
                        key={oj.id}
                        onClick={() => setSelectedJob(oj)}
                        style={{
                          border: isSelected ? "1px solid #FF425E" : "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "8px",
                          padding: "12px 16px",
                          cursor: "pointer",
                          backgroundColor: isSelected ? "rgba(255,66,94,0.1)" : "rgba(255,255,255,0.03)",
                          transition: "all 0.15s ease",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "12px",
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: "13px", color: "#fff", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {ojTitle}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px", flexWrap: "wrap" }}>
                            <span style={{
                              fontSize: "9px",
                              padding: "1px 6px",
                              borderRadius: "4px",
                              border: "1px solid rgba(255,255,255,0.15)",
                              color: "rgba(255,255,255,0.6)",
                              backgroundColor: "rgba(255,255,255,0.05)",
                            }}>
                              {ojCat.tag}
                            </span>
                            <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>
                              {truncateWallet(oj.posterWallet)}
                            </span>
                            <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)" }}>
                              {new Date(oj.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                          <img src={USDC_LOGO_URL} alt="USDC" width={16} height={16} style={{ borderRadius: "50%" }} />
                          <span style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>
                            {oj.amount.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Selected job details */}
              {selectedJob && (
                <div
                  style={{
                    marginTop: "16px",
                    padding: "16px",
                    border: "1px solid rgba(255,66,94,0.2)",
                    borderRadius: "8px",
                    backgroundColor: "rgba(255,66,94,0.05)",
                  }}
                >
                  <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#FF425E", marginBottom: "8px", fontWeight: 600 }}>
                    Selected Job
                  </div>
                  <div style={{ fontSize: "15px", color: "#fff", fontWeight: 600, marginBottom: "8px" }}>
                    {String(selectedJob.specJson?.title || selectedJob.id)}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                    <div>
                      <div style={{ fontSize: "9px", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: "2px" }}>Amount</div>
                      <div style={{ fontSize: "13px", color: "#fff", display: "flex", alignItems: "center", gap: "4px" }}>
                        <img src={USDC_LOGO_URL} alt="USDC" width={14} height={14} style={{ borderRadius: "50%" }} />
                        {selectedJob.amount.toFixed(2)} USDC
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "9px", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: "2px" }}>Min Words</div>
                      <div style={{ fontSize: "13px", color: "#fff" }}>{selectedJob.minWords}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "9px", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: "2px" }}>Category</div>
                      <div style={{ fontSize: "13px", color: "#fff" }}>{getCategoryById(selectedJob.category).tag}</div>
                    </div>
                  </div>
                  {typeof selectedJob.specJson?.description === "string" && selectedJob.specJson.description && (
                    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>
                      {String(selectedJob.specJson.description).slice(0, 200)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Rounds Selector (only for new job mode) */}
          {arenaMode === "new" && (
          <div
            style={{
              textAlign: "center",
              marginBottom: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            <span style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)" }}>
              Rounds:
            </span>
            {[1, 3, 5].map((n) => (
              <button
                key={n}
                onClick={() => !running && setSelectedRounds(n)}
                disabled={running}
                style={{
                  fontFamily: "inherit",
                  fontSize: "12px",
                  fontWeight: selectedRounds === n ? 700 : 400,
                  padding: "4px 14px",
                  cursor: running ? "not-allowed" : "pointer",
                  border: selectedRounds === n ? "1px solid #ffffff" : "1px solid rgba(255,255,255,0.2)",
                  borderRadius: "4px",
                  backgroundColor: selectedRounds === n ? "rgba(255,255,255,0.15)" : "transparent",
                  color: selectedRounds === n ? "#ffffff" : "rgba(255,255,255,0.5)",
                  transition: "all 0.15s ease",
                }}
              >
                {n}
              </button>
            ))}
          </div>
          )}

          {/* Controls */}
          <div
            style={{
              textAlign: "center",
              marginBottom: "24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "16px",
            }}
          >
            {currentRoundOf > 0 && selectedRounds > 1 && (
              <span
                style={{
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#42BDFF",
                  border: "1px solid rgba(253,230,138,0.3)",
                  padding: "4px 12px",
                  borderRadius: "4px",
                  backgroundColor: "rgba(253,230,138,0.1)",
                  fontWeight: 600,
                }}
              >
                Round {currentRoundOf}/{selectedRounds}
              </span>
            )}
            {round > 0 && !currentRoundOf && (
              <span
                style={{
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "rgba(255,255,255,0.4)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  padding: "4px 12px",
                  borderRadius: "4px",
                }}
              >
                Round {round}
              </span>
            )}
            {arenaMode === "new" ? (
              <button
                onClick={done ? runArena : running ? undefined : runArena}
                disabled={running}
                onMouseEnter={() => setButtonHover(true)}
                onMouseLeave={() => setButtonHover(false)}
                style={{
                  fontFamily: "inherit",
                  fontSize: "13px",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  padding: "10px 28px",
                  cursor: running ? "not-allowed" : "pointer",
                  border: "1px solid #ffffff",
                  borderRadius: "6px",
                  backgroundColor: running
                    ? "rgba(255,255,255,0.05)"
                    : buttonHover
                    ? "rgba(255,255,255,0.15)"
                    : "rgba(255,255,255,0.08)",
                  color: running ? "rgba(255,255,255,0.3)" : "#ffffff",
                  backdropFilter: "blur(8px)",
                  transition: "all 0.2s ease",
                  fontWeight: 600,
                }}
              >
                {running ? "Running..." : done ? "Run Again" : "Start Arena"}
              </button>
            ) : (
              <button
                onClick={done ? runFulfillment : running ? undefined : runFulfillment}
                disabled={running || !selectedJob}
                onMouseEnter={() => setButtonHover(true)}
                onMouseLeave={() => setButtonHover(false)}
                style={{
                  fontFamily: "inherit",
                  fontSize: "13px",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  padding: "10px 28px",
                  cursor: running || !selectedJob ? "not-allowed" : "pointer",
                  border: `1px solid ${!selectedJob ? "rgba(255,255,255,0.2)" : "#FF425E"}`,
                  borderRadius: "6px",
                  backgroundColor: running || !selectedJob
                    ? "rgba(255,255,255,0.05)"
                    : buttonHover
                    ? "rgba(255,66,94,0.2)"
                    : "rgba(255,66,94,0.1)",
                  color: running || !selectedJob ? "rgba(255,255,255,0.3)" : "#FF425E",
                  backdropFilter: "blur(8px)",
                  transition: "all 0.2s ease",
                  fontWeight: 600,
                }}
              >
                {running ? "Fulfilling..." : done ? "Fulfill Again" : "Start Fulfillment"}
              </button>
            )}
          </div>

          {/* Multi-Round Summary */}
          {multiRoundSummary && (
            <div
              style={{
                backgroundColor: "rgba(0,0,0,0.4)",
                border: "1px solid rgba(134,239,172,0.25)",
                borderRadius: "10px",
                padding: "20px",
                backdropFilter: "blur(12px)",
                marginBottom: "24px",
              }}
            >
              <div
                style={{
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "#FFE342",
                  marginBottom: "16px",
                  fontWeight: 600,
                }}
              >
                Multi-Round Summary ({multiRoundSummary.totalRounds} Rounds)
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "16px" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "24px", fontWeight: 700, color: "#fff" }}>{multiRoundSummary.totalJobs}</div>
                  <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: "4px" }}>Jobs Created</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "24px", fontWeight: 700, color: "#fff", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <img src={USDC_LOGO_URL} alt="USDC" width={18} height={18} style={{ borderRadius: "50%" }} />
                    {multiRoundSummary.totalUsdc.toFixed(2)}
                  </div>
                  <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: "4px" }}>Total USDC</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "24px", fontWeight: 700, color: "#fff" }}>{multiRoundSummary.totalTx}</div>
                  <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: "4px" }}>Total TX</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "24px", fontWeight: 700, color: "#fff" }}>{(multiRoundSummary.avgTimePerRound / 1000).toFixed(1)}s</div>
                  <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: "4px" }}>Avg Time/Round</div>
                </div>
              </div>
            </div>
          )}

          {/* Agent Panels */}
          <div style={{ display: "flex", gap: "24px", marginBottom: "24px" }}>
            {renderAgentPanel(AGENT_ALPHA_CONFIG, alphaState, alphaThought, alphaActions, copiedAlpha, "alpha")}

            {/* Agent Chat Panel */}
            {chatMessages.length > 0 && (
              <div
                style={{
                  backgroundColor: "rgba(0,0,0,0.4)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "10px",
                  padding: "12px",
                  backdropFilter: "blur(12px)",
                  width: "220px",
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.4)", marginBottom: "8px", fontWeight: 600 }}>
                  Agent Chat
                </div>
                <div
                  ref={chatPanelRef}
                  style={{
                    flex: 1,
                    maxHeight: "200px",
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  {chatMessages.map((msg, i) => {
                    const isAlpha = msg.agent === "alpha";
                    return (
                      <div
                        key={i}
                        style={{
                          alignSelf: isAlpha ? "flex-start" : "flex-end",
                          maxWidth: "90%",
                        }}
                      >
                        <div
                          style={{
                            backgroundColor: isAlpha ? "rgba(59,130,246,0.2)" : "rgba(16,185,129,0.2)",
                            border: `1px solid ${isAlpha ? "rgba(59,130,246,0.3)" : "rgba(16,185,129,0.3)"}`,
                            borderRadius: isAlpha ? "8px 8px 8px 2px" : "8px 8px 2px 8px",
                            padding: "6px 10px",
                          }}
                        >
                          <div style={{ fontSize: "8px", fontWeight: 700, color: isAlpha ? "#42BDFF" : "#42BDFF", marginBottom: "2px", textTransform: "uppercase" }}>
                            {isAlpha ? "Alpha" : "Omega"}
                          </div>
                          <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.8)", lineHeight: 1.4 }}>
                            {msg.message}
                          </div>
                          <div style={{ fontSize: "7px", color: "rgba(255,255,255,0.25)", marginTop: "2px", textAlign: "right" }}>
                            {msg.timestamp}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {renderAgentPanel(AGENT_OMEGA_CONFIG, omegaState, omegaThought, omegaActions, copiedOmega, "omega")}
          </div>

          {/* Escrow Visualizer */}
          {escrowPhase !== "idle" && (
            <div
              style={{
                backgroundColor: "rgba(0,0,0,0.4)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "10px",
                padding: "12px 20px",
                backdropFilter: "blur(12px)",
                marginBottom: "24px",
              }}
            >
              <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.4)", marginBottom: "4px", textAlign: "center" }}>
                Escrow Flow
              </div>
              <EscrowVisualizer
                phase={escrowPhase}
                amount={escrowAmount}
                posterLabel="ALPHA"
                takerLabel="OMEGA"
              />
            </div>
          )}

          {/* Job Status Progress Bar */}
          {jobStatus !== "idle" && (
            <div
              style={{
                backgroundColor: "rgba(0,0,0,0.4)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "10px",
                padding: "20px",
                backdropFilter: "blur(12px)",
                marginBottom: "24px",
              }}
            >
              <div
                style={{
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "rgba(255,255,255,0.4)",
                  marginBottom: "16px",
                }}
              >
                Job Progress
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0" }}>
                {(["created", "accepted", "completed", "settled"] as const).map((step, i) => {
                  const stepOrder = { created: 0, accepted: 1, completed: 2, settled: 3 };
                  const currentOrder = { idle: -1, created: 0, accepted: 1, completed: 3 };
                  const isCompleted = currentOrder[jobStatus] >= stepOrder[step];
                  const isCurrent =
                    (jobStatus === "created" && step === "created") ||
                    (jobStatus === "accepted" && step === "accepted") ||
                    (jobStatus === "completed" && step === "completed");
                  const stepColor = isCurrent
                    ? step === "created" || step === "accepted"
                      ? AGENT_ALPHA_CONFIG.color
                      : AGENT_OMEGA_CONFIG.color
                    : "#ffffff";

                  return (
                    <div key={step} style={{ display: "flex", alignItems: "center" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                        <div
                          style={{
                            width: "24px",
                            height: "24px",
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "11px",
                            fontWeight: 600,
                            backgroundColor: isCompleted ? stepColor : "transparent",
                            border: `2px solid ${isCompleted ? stepColor : "rgba(255,255,255,0.2)"}`,
                            color: isCompleted ? "#000" : "rgba(255,255,255,0.3)",
                            transition: "all 0.3s ease",
                            ...(isCurrent && !isCompleted
                              ? { animation: "pulse 1.5s ease-in-out infinite", boxShadow: `0 0 12px ${stepColor}40` }
                              : {}),
                          }}
                        >
                          {isCompleted ? "\u2713" : ""}
                        </div>
                        <span
                          style={{
                            fontSize: "9px",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            color: isCompleted ? "#fff" : "rgba(255,255,255,0.3)",
                            fontWeight: isCurrent ? 600 : 400,
                          }}
                        >
                          {step === "completed" ? "Verified" : step === "settled" ? "Settled" : step}
                        </span>
                      </div>
                      {i < 3 && (
                        <div
                          style={{
                            width: "80px",
                            height: "2px",
                            backgroundColor:
                              currentOrder[jobStatus] > stepOrder[step]
                                ? "rgba(255,255,255,0.3)"
                                : "rgba(255,255,255,0.08)",
                            margin: "0 8px",
                            marginBottom: "20px",
                            transition: "background-color 0.3s ease",
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* x402 Payment Protocol */}
          {jobStatus !== "idle" && (
            <div
              style={{
                backgroundColor: "rgba(0,0,0,0.4)",
                border: "1px solid rgba(245,158,11,0.2)",
                borderRadius: "10px",
                padding: "20px",
                backdropFilter: "blur(12px)",
                marginBottom: "24px",
              }}
            >
              <div
                style={{
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "#f59e0b",
                  marginBottom: "20px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span
                  style={{
                    fontSize: "8px",
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: "3px",
                    backgroundColor: "#f59e0b20",
                    border: "1px solid #f59e0b40",
                    letterSpacing: "0.06em",
                  }}
                >
                  402
                </span>
                x402 Payment Protocol
              </div>

              {x402Payments.length === 0 ? (
                <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "20px 0" }}>
                  Awaiting x402 micropayments...
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                  {/* Payment flow diagram */}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", gap: "0", position: "relative" }}>
                    {/* OMEGA box */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", width: "140px", flexShrink: 0 }}>
                      <div
                        style={{
                          border: "1px solid #42BDFF50",
                          borderRadius: "8px",
                          padding: "12px 16px",
                          backgroundColor: "#42BDFF10",
                          textAlign: "center",
                          width: "100%",
                        }}
                      >
                        <div style={{ fontSize: "12px", fontWeight: 700, color: "#42BDFF", marginBottom: "2px" }}>OMEGA</div>
                        <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Taker</div>
                      </div>
                    </div>

                    {/* Center column: arrows to Alpha and Protocol */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, minWidth: "120px", gap: "16px", paddingTop: "8px" }}>
                      {/* Arrow Omega -> Alpha (access fee) */}
                      {x402Payments.some((p) => p.memo === "access job spec API") && (() => {
                        const payment = x402Payments.find((p) => p.memo === "access job spec API")!;
                        return (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", animation: "fadeIn 0.5s ease-in" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              <img src={SOL_LOGO_URL} alt="SOL" width={12} height={12} style={{ borderRadius: "50%" }} />
                              <span style={{ fontSize: "11px", fontWeight: 600, color: "#f59e0b" }}>{payment.amount} SOL</span>
                            </div>
                            <div style={{ width: "100%", height: "2px", background: "linear-gradient(90deg, #42BDFF, #f59e0b, #42BDFF)", borderRadius: "1px", boxShadow: "0 0 8px #f59e0b40" }} />
                            <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.4)" }}>API Access Fee</div>
                            <a
                              href={`https://explorer.solana.com/tx/${payment.txHash}?cluster=devnet`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize: "8px", color: "#f59e0b", textDecoration: "none", opacity: 0.6 }}
                            >
                              {payment.txHash.slice(0, 8)}...
                            </a>
                          </div>
                        );
                      })()}
                    </div>

                    {/* ALPHA box */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", width: "140px", flexShrink: 0 }}>
                      <div
                        style={{
                          border: "1px solid #42BDFF50",
                          borderRadius: "8px",
                          padding: "12px 16px",
                          backgroundColor: "#42BDFF10",
                          textAlign: "center",
                          width: "100%",
                        }}
                      >
                        <div style={{ fontSize: "12px", fontWeight: 700, color: "#42BDFF", marginBottom: "2px" }}>ALPHA</div>
                        <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Poster</div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom row: arrows to Protocol */}
                  <div style={{ display: "flex", justifyContent: "center", gap: "40px" }}>
                    {/* Omega -> Protocol (verification) */}
                    {x402Payments.some((p) => p.memo === "proof verification fee") && (() => {
                      const payment = x402Payments.find((p) => p.memo === "proof verification fee")!;
                      return (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", animation: "fadeIn 0.5s ease-in" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <img src={SOL_LOGO_URL} alt="SOL" width={12} height={12} style={{ borderRadius: "50%" }} />
                            <span style={{ fontSize: "11px", fontWeight: 600, color: "#f59e0b" }}>{payment.amount} SOL</span>
                          </div>
                          <div style={{ width: "60px", height: "2px", background: "linear-gradient(180deg, #42BDFF, #f59e0b)", borderRadius: "1px", boxShadow: "0 0 8px #f59e0b40" }} />
                          <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.4)" }}>Verification</div>
                          <a
                            href={`https://explorer.solana.com/tx/${payment.txHash}?cluster=devnet`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: "8px", color: "#f59e0b", textDecoration: "none", opacity: 0.6 }}
                          >
                            {payment.txHash.slice(0, 8)}...
                          </a>
                        </div>
                      );
                    })()}

                    {/* Alpha -> Protocol (escrow) */}
                    {x402Payments.some((p) => p.memo === "escrow service fee") && (() => {
                      const payment = x402Payments.find((p) => p.memo === "escrow service fee")!;
                      return (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", animation: "fadeIn 0.5s ease-in" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <img src={SOL_LOGO_URL} alt="SOL" width={12} height={12} style={{ borderRadius: "50%" }} />
                            <span style={{ fontSize: "11px", fontWeight: 600, color: "#f59e0b" }}>{payment.amount} SOL</span>
                          </div>
                          <div style={{ width: "60px", height: "2px", background: "linear-gradient(180deg, #42BDFF, #f59e0b)", borderRadius: "1px", boxShadow: "0 0 8px #f59e0b40" }} />
                          <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.4)" }}>Escrow Fee</div>
                          <a
                            href={`https://explorer.solana.com/tx/${payment.txHash}?cluster=devnet`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: "8px", color: "#f59e0b", textDecoration: "none", opacity: 0.6 }}
                          >
                            {payment.txHash.slice(0, 8)}...
                          </a>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Protocol Escrow box */}
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <div
                      style={{
                        border: "1px solid rgba(255,255,255,0.2)",
                        borderRadius: "8px",
                        padding: "12px 24px",
                        backgroundColor: "rgba(255,255,255,0.05)",
                        textAlign: "center",
                        minWidth: "200px",
                      }}
                    >
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#ffffff", marginBottom: "2px" }}>PROTOCOL ESCROW</div>
                      <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Deployer</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Job Details Card */}
          {jobData && (
            <div
              style={{
                backgroundColor: "rgba(0,0,0,0.4)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "10px",
                padding: "24px",
                backdropFilter: "blur(12px)",
                marginBottom: "24px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div
                  style={{
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "rgba(255,255,255,0.4)",
                  }}
                >
                  Job Details
                </div>
                <a
                  href="/taker"
                  style={{
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "#42BDFF",
                    textDecoration: "none",
                    padding: "4px 10px",
                    border: "1px solid rgba(59,130,246,0.3)",
                    borderRadius: "4px",
                  }}
                >
                  View
                </a>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px" }}>
                <div>
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", marginBottom: "4px" }}>Title</div>
                  <div style={{ fontSize: "13px", color: "#fff" }}>
                    {String(specData?.title || jobData?.title || "—")}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", marginBottom: "4px" }}>Category</div>
                  <div style={{ fontSize: "13px", color: "#fff" }}>
                    {(() => {
                      const catId = String(specData?.categoryId || specData?.category || "");
                      const cat = getCategoryById(catId);
                      return `${cat.tag} \u00B7 ${cat.label}`;
                    })()}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", marginBottom: "4px" }}>Amount</div>
                  <div style={{ fontSize: "13px", color: "#fff", display: "flex", alignItems: "center", gap: "6px" }}>
                    <img src={USDC_LOGO_URL} alt="USDC" width={16} height={16} style={{ borderRadius: "50%" }} />
                    {String(specData?.amount || jobData?.amount || "—")} USDC
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", marginBottom: "4px" }}>Min Words</div>
                  <div style={{ fontSize: "13px", color: "#fff" }}>
                    {String(specData?.minWords || jobData?.minWords || "—")}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", marginBottom: "4px" }}>Status</div>
                  <div style={{ fontSize: "13px", color: "#fff", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ color: jobStatus === "created" || jobStatus === "accepted" || jobStatus === "completed" ? "#FFE342" : "rgba(255,255,255,0.3)" }}>
                      Open {(jobStatus === "created" || jobStatus === "accepted" || jobStatus === "completed") ? "\u2713" : ""}
                    </span>
                    <span style={{ color: "rgba(255,255,255,0.3)" }}>&rarr;</span>
                    <span style={{ color: jobStatus === "accepted" || jobStatus === "completed" ? "#FFE342" : "rgba(255,255,255,0.3)" }}>
                      Accepted {(jobStatus === "accepted" || jobStatus === "completed") ? "\u2713" : ""}
                    </span>
                    <span style={{ color: "rgba(255,255,255,0.3)" }}>&rarr;</span>
                    <span style={{ color: jobStatus === "completed" ? "#FFE342" : "rgba(255,255,255,0.3)" }}>
                      Completed {jobStatus === "completed" ? "\u2713" : ""}
                    </span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", marginBottom: "4px" }}>Description</div>
                  <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.8)", lineHeight: 1.5, maxHeight: "60px", overflow: "hidden", wordBreak: "break-word" }}>
                    {String(specData?.description || specData?.title || "—")}
                  </div>
                </div>
                {typeof specData?.specHash === "string" && (
                  <div>
                    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", marginBottom: "4px" }}>Spec Hash</div>
                    <div style={{ fontSize: "13px", color: "#fff", fontFamily: "monospace" }}>
                      {specData.specHash.slice(0, 16)}...
                    </div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", marginBottom: "4px" }}>Job ID</div>
                  <div style={{ fontSize: "13px", color: "#fff", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontFamily: "monospace" }}>{String(jobData.jobId).slice(0, 12)}...</span>
                    <a href="/taker" style={{ fontSize: "10px", color: "#42BDFF", textDecoration: "none" }}>[view]</a>
                  </div>
                </div>
                {typeof jobData.txHash === "string" && (
                  <div>
                    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", marginBottom: "4px" }}>TX</div>
                    <div style={{ fontSize: "13px", color: "#fff", display: "flex", alignItems: "center", gap: "6px" }}>
                      <img src={SOL_LOGO_URL} alt="SOL" width={14} height={14} style={{ borderRadius: "50%" }} />
                      <span style={{ fontFamily: "monospace" }}>{String(jobData.txHash).slice(0, 8)}...</span>
                      <a
                        href={`https://explorer.solana.com/tx/${String(jobData.txHash)}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: "10px", color: "#42BDFF", textDecoration: "none" }}
                      >
                        [Explorer]
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ZK Proof + Deliverable side by side */}
          {(jobStatus === "accepted" || jobStatus === "completed" || omegaState === "working") && (
            <div style={{ display: "flex", gap: "24px", marginBottom: "24px" }}>
              {/* ZK Proof Visualization */}
              <div
                style={{
                  backgroundColor: "rgba(0,0,0,0.4)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "10px",
                  padding: "20px",
                  backdropFilter: "blur(12px)",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "rgba(255,255,255,0.4)",
                    marginBottom: "16px",
                  }}
                >
                  Zero-Knowledge Proof
                </div>
                {zkData ? (
                  <div style={{ fontSize: "13px", color: "#fff", lineHeight: 1.8 }}>
                    <div style={{ marginBottom: "12px" }}>
                      <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>Circuit:</span>{" "}
                      SP1 Word Count Verifier
                    </div>
                    <div style={{ marginBottom: "12px" }}>
                      <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>Private Input:</span>{" "}
                      <span style={{ color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>[text] (hidden)</span>
                    </div>
                    <div style={{ marginBottom: "4px" }}>
                      <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>Public Inputs:</span>
                    </div>
                    <div style={{ paddingLeft: "12px", marginBottom: "12px", fontSize: "12px", fontFamily: "monospace" }}>
                      <div>min_words: {String(specData?.minWords || "—")}</div>
                      <div>text_hash: {String(zkData.textHash).slice(0, 20)}...</div>
                    </div>
                    <div
                      style={{
                        borderTop: "1px solid rgba(255,255,255,0.08)",
                        paddingTop: "12px",
                        marginBottom: "4px",
                      }}
                    >
                      <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>Verification:</span>
                    </div>
                    <div style={{ paddingLeft: "12px", fontSize: "12px" }}>
                      <div style={{ color: "#FFE342" }}>
                        Word Count: {String(zkData.wordCount)} &ge; {String(specData?.minWords || "—")} &#10003;
                      </div>
                      <div style={{ color: "#FFE342" }}>Hash Match: SHA-256 &#10003;</div>
                      <div style={{ color: "#FFE342", fontWeight: 600 }}>Status: VERIFIED &#10003;</div>
                    </div>
                    {typeof zkData.txHash === "string" && (
                      <div style={{ marginTop: "12px", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "12px" }}>
                        <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>Submit TX:</span>{" "}
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                          <img src={SOL_LOGO_URL} alt="SOL" width={14} height={14} style={{ borderRadius: "50%" }} />
                          <span style={{ fontFamily: "monospace", fontSize: "12px" }}>{String(zkData.txHash).slice(0, 8)}...</span>
                          <a
                            href={`https://explorer.solana.com/tx/${String(zkData.txHash)}?cluster=devnet`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: "10px", color: "#42BDFF", textDecoration: "none" }}
                          >
                            [Explorer]
                          </a>
                        </span>
                      </div>
                    )}
                  </div>
                ) : omegaState === "working" ? (
                  <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        backgroundColor: AGENT_OMEGA_CONFIG.color,
                        display: "inline-block",
                        animation: "pulse 1s ease-in-out infinite",
                      }}
                    />
                    Generating proof...
                  </div>
                ) : (
                  <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.3)" }}>
                    Awaiting work submission...
                  </div>
                )}
              </div>

              {/* Deliverable Preview */}
              <div
                style={{
                  backgroundColor: "rgba(0,0,0,0.4)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "10px",
                  padding: "20px",
                  backdropFilter: "blur(12px)",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "rgba(255,255,255,0.4)",
                    marginBottom: "16px",
                  }}
                >
                  Deliverable Output
                </div>
                {deliverablePreview ? (
                  <div>
                    <div
                      style={{
                        backgroundColor: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: "6px",
                        padding: "12px",
                        fontFamily: "monospace",
                        fontSize: "11px",
                        color: "rgba(255,255,255,0.7)",
                        lineHeight: 1.6,
                        maxHeight: "160px",
                        overflowY: "auto",
                        marginBottom: "16px",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {deliverablePreview.slice(0, 500)}
                      {deliverablePreview.length > 500 ? "..." : ""}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                      <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>Word Count:</span>
                      <span style={{ fontSize: "13px", color: "#fff" }}>
                        {String(zkData?.wordCount || "—")} / {String(specData?.minWords || "—")} required
                      </span>
                    </div>
                    <div
                      style={{
                        height: "6px",
                        borderRadius: "3px",
                        backgroundColor: "rgba(255,255,255,0.08)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          borderRadius: "3px",
                          backgroundColor: "#42BDFF",
                          width: `${Math.min(100, (Number(zkData?.wordCount || 0) / Math.max(1, Number(specData?.minWords || 1))) * 100)}%`,
                          transition: "width 0.5s ease",
                        }}
                      />
                    </div>
                  </div>
                ) : omegaState === "working" ? (
                  <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        backgroundColor: AGENT_OMEGA_CONFIG.color,
                        display: "inline-block",
                        animation: "pulse 1s ease-in-out infinite",
                      }}
                    />
                    Generating deliverable...
                  </div>
                ) : (
                  <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.3)" }}>
                    Awaiting work submission...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Terminal */}
          <div
            style={{
              backgroundColor: "rgba(0,0,0,0.6)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "8px",
              overflow: "hidden",
            }}
          >
            {/* Terminal title bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 12px",
                borderBottom: "1px solid rgba(255,255,255,0.1)",
                backgroundColor: "rgba(255,255,255,0.04)",
              }}
            >
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#ff5f57", display: "inline-block" }} />
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#FFE342", display: "inline-block" }} />
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#FFE342", display: "inline-block" }} />
              <span
                style={{
                  marginLeft: "8px",
                  fontSize: "11px",
                  color: "rgba(255,255,255,0.4)",
                  letterSpacing: "0.03em",
                }}
              >
                covenant-arena -- event stream
              </span>
            </div>

            {/* Log entries */}
            <div
              ref={logPanelRef}
              style={{
                padding: "16px",
                minHeight: "140px",
                maxHeight: "350px",
                overflowY: "auto",
                fontFamily: "inherit",
                fontSize: "11px",
              }}
            >
              {logs.length === 0 ? (
                <div
                  style={{
                    color: "rgba(255,255,255,0.3)",
                    fontSize: "11px",
                    textAlign: "center",
                    padding: "40px 0",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Press START ARENA to begin
                </div>
              ) : (
                logs.map((log, i) => {
                  const { event } = log;
                  const dotColor = getEventDotColor(event.step);
                  const textColor = getEventTextColor(event.step);
                  const txHash =
                    event.data && typeof event.data.txHash === "string"
                      ? event.data.txHash
                      : null;

                  // Render message with inline USDC logo for amounts
                  const usdcPattern = /(\d+(?:\.\d{1,2})?\s*USDC)/g;
                  const usdcCheck = /^\d+(?:\.\d{1,2})?\s*USDC$/;
                  const parts = event.message.split(usdcPattern);
                  const renderedMessage = parts.map((part, pi) => {
                    if (usdcCheck.test(part)) {
                      return (
                        <span key={pi} style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                          <img src={USDC_LOGO_URL} alt="USDC" width={14} height={14} style={{ borderRadius: "50%", verticalAlign: "middle" }} />
                          {part}
                        </span>
                      );
                    }
                    return <span key={pi}>{part}</span>;
                  });

                  return (
                    <div key={i} style={{ marginBottom: "6px", lineHeight: 1.6 }}>
                      <div style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
                        <span
                          style={{
                            color: "rgba(255,255,255,0.3)",
                            flexShrink: 0,
                            fontVariantNumeric: "tabular-nums",
                            fontSize: "10px",
                          }}
                        >
                          {log.timestamp}
                        </span>
                        <span
                          style={{
                            width: "6px",
                            height: "6px",
                            borderRadius: "50%",
                            backgroundColor: dotColor,
                            flexShrink: 0,
                            display: "inline-block",
                            marginTop: "2px",
                          }}
                        />
                        <span
                          style={{
                            color: textColor,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            flexWrap: "wrap",
                          }}
                        >
                          {txHash && (
                            <img src={SOL_LOGO_URL} alt="SOL" width={14} height={14} style={{ borderRadius: "50%", verticalAlign: "middle" }} />
                          )}
                          {renderedMessage}
                          {txHash && (
                            <a
                              href={`https://explorer.solana.com/tx/${txHash}?cluster=devnet`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                marginLeft: "6px",
                                fontSize: "10px",
                                color: "#5ba4f5",
                                textDecoration: "none",
                              }}
                            >
                              [View TX]
                            </a>
                          )}
                        </span>
                      </div>
                      {/* Show data preview for certain events */}
                      {event.step === "alpha_thought" && event.data && (
                        <div
                          style={{
                            paddingLeft: "32px",
                            fontSize: "10px",
                            color: "rgba(255,255,255,0.35)",
                            marginTop: "2px",
                          }}
                        >
                          [{String(event.data.categoryTag)}] {String(event.data.amount)} USDC / {String(event.data.minWords)} words min
                        </div>
                      )}
                      {event.step === "x402_payment" && event.data && (
                        <div
                          style={{
                            paddingLeft: "32px",
                            fontSize: "10px",
                            color: "#f59e0b",
                            marginTop: "2px",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "8px",
                              fontWeight: 700,
                              padding: "1px 4px",
                              borderRadius: "3px",
                              backgroundColor: "#f59e0b20",
                              border: "1px solid #f59e0b40",
                              color: "#f59e0b",
                              letterSpacing: "0.04em",
                            }}
                          >
                            402
                          </span>
                          <img src={SOL_LOGO_URL} alt="SOL" width={12} height={12} style={{ borderRadius: "50%" }} />
                          <span>{String(event.data.amount)} SOL</span>
                          <span style={{ color: "rgba(255,255,255,0.3)" }}>&mdash;</span>
                          <span style={{ color: "rgba(255,255,255,0.5)" }}>{String(event.data.memo)}</span>
                          {typeof event.data.txHash === "string" && (
                            <a
                              href={`https://explorer.solana.com/tx/${String(event.data.txHash)}?cluster=devnet`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize: "9px", color: "#f59e0b", textDecoration: "none", opacity: 0.7 }}
                            >
                              [{String(event.data.txHash).slice(0, 8)}...]
                            </a>
                          )}
                        </div>
                      )}
                      {event.step === "omega_completed" && event.data && (
                        <div
                          style={{
                            paddingLeft: "32px",
                            fontSize: "10px",
                            color: "rgba(255,255,255,0.3)",
                            marginTop: "2px",
                            maxWidth: "600px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Preview: {String(event.data.textPreview).slice(0, 100)}...
                        </div>
                      )}
                      {event.step === "a2a_message" && event.data && (
                        <div
                          style={{
                            paddingLeft: "32px",
                            fontSize: "10px",
                            color: "#feffaf",
                            marginTop: "2px",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "8px",
                              fontWeight: 700,
                              padding: "1px 4px",
                              borderRadius: "3px",
                              backgroundColor: "rgba(168, 85, 247, 0.15)",
                              border: "1px solid rgba(168, 85, 247, 0.3)",
                              color: "#feffaf",
                              letterSpacing: "0.04em",
                            }}
                          >
                            A2A
                          </span>
                          <span>{String(event.data.method)}</span>
                          <span style={{ color: "rgba(255,255,255,0.25)", fontFamily: "monospace" }}>
                            {String(event.data.did).slice(0, 20)}...
                          </span>
                        </div>
                      )}
                      {event.step === "complete" && event.data && (
                        <div
                          style={{
                            paddingLeft: "32px",
                            fontSize: "10px",
                            color: "#FFE342",
                            marginTop: "2px",
                          }}
                        >
                          Total time: {String(event.data.totalTime)}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* A2A Protocol Log */}
          {a2aMessages.length > 0 && (
            <div
              style={{
                backgroundColor: "rgba(0,0,0,0.4)",
                border: "1px solid rgba(168, 85, 247, 0.2)",
                borderRadius: "10px",
                padding: "16px 20px",
                backdropFilter: "blur(12px)",
                marginTop: "16px",
                marginBottom: "24px",
              }}
            >
              <button
                onClick={() => setA2aExpanded(!a2aExpanded)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  width: "100%",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  marginBottom: a2aExpanded ? "12px" : 0,
                }}
              >
                <span
                  style={{
                    fontSize: "8px",
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: "3px",
                    backgroundColor: "rgba(168, 85, 247, 0.15)",
                    color: "#feffaf",
                    border: "1px solid rgba(168, 85, 247, 0.3)",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  A2A
                </span>
                <span
                  style={{
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "#feffaf",
                    fontWeight: 600,
                  }}
                >
                  Protocol Log
                </span>
                <span
                  style={{
                    fontSize: "10px",
                    color: "rgba(255,255,255,0.3)",
                    marginLeft: "auto",
                  }}
                >
                  {a2aMessages.length} messages
                </span>
                <span
                  style={{
                    fontSize: "8px",
                    color: "rgba(255,255,255,0.3)",
                    transform: a2aExpanded ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.15s ease",
                  }}
                >
                  {"\u25BC"}
                </span>
              </button>
              {a2aExpanded && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {a2aMessages.map((msg, i) => (
                    <div
                      key={i}
                      style={{
                        backgroundColor: "rgba(168, 85, 247, 0.06)",
                        border: "1px solid rgba(168, 85, 247, 0.15)",
                        borderRadius: "6px",
                        padding: "10px 12px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                        <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.3)", fontVariantNumeric: "tabular-nums" }}>
                          {msg.timestamp}
                        </span>
                        <span
                          style={{
                            fontSize: "8px",
                            fontWeight: 700,
                            padding: "1px 5px",
                            borderRadius: "3px",
                            backgroundColor: "rgba(168, 85, 247, 0.15)",
                            color: "#feffaf",
                            border: "1px solid rgba(168, 85, 247, 0.3)",
                          }}
                        >
                          A2A
                        </span>
                        <span style={{ fontSize: "11px", fontWeight: 600, color: "#feffaf" }}>
                          {msg.method}
                        </span>
                      </div>
                      <div
                        style={{
                          fontFamily: "monospace",
                          fontSize: "10px",
                          color: "rgba(255,255,255,0.5)",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                        }}
                      >
                        {JSON.stringify(msg.params, null, 2)}
                      </div>
                      <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.25)", marginTop: "4px", fontFamily: "monospace" }}>
                        DID: {msg.did.slice(0, 24)}...
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Transaction Summary */}
          {transactions.length > 0 && (
            <div
              style={{
                backgroundColor: "rgba(0,0,0,0.4)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "10px",
                padding: "20px",
                backdropFilter: "blur(12px)",
                marginTop: "24px",
              }}
            >
              <div
                style={{
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "rgba(255,255,255,0.4)",
                  marginBottom: "16px",
                }}
              >
                Transaction Summary
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {transactions.map((tx, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "8px 0",
                      borderBottom: i < transactions.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                    }}
                  >
                    <img src={SOL_LOGO_URL} alt="SOL" width={18} height={18} style={{ borderRadius: "50%" }} />
                    <span style={{ fontSize: "13px", color: "#fff", minWidth: "100px" }}>{tx.label}</span>
                    <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)", fontFamily: "monospace" }}>
                      {tx.txHash.slice(0, 8)}...{tx.txHash.slice(-4)}
                    </span>
                    <a
                      href={`https://explorer.solana.com/tx/${tx.txHash}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: "10px",
                        color: "#42BDFF",
                        textDecoration: "none",
                        marginLeft: "auto",
                      }}
                    >
                      [View TX]
                    </a>
                  </div>
                ))}
              </div>
              <div
                style={{
                  marginTop: "16px",
                  paddingTop: "12px",
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "11px",
                  color: "rgba(255,255,255,0.4)",
                }}
              >
                <span>Total: {transactions.length} on-chain transaction{transactions.length !== 1 ? "s" : ""}</span>
                <span>Network: Solana Devnet</span>
              </div>
            </div>
          )}

          {/* Cost Breakdown */}
          {done && x402Payments.length > 0 && (
            <div
              style={{
                backgroundColor: "rgba(0,0,0,0.4)",
                border: "1px solid rgba(245,158,11,0.15)",
                borderRadius: "10px",
                padding: "20px",
                backdropFilter: "blur(12px)",
                marginTop: "24px",
              }}
            >
              <div
                style={{
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "rgba(255,255,255,0.4)",
                  marginBottom: "16px",
                }}
              >
                Cost Breakdown
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
                {/* Haiku API Alpha */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>Haiku API (Alpha)</span>
                  <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.8)", fontFamily: "monospace" }}>~$0.003</span>
                </div>
                {/* Haiku API Omega x2 */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>Haiku API (Omega x2)</span>
                  <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.8)", fontFamily: "monospace" }}>~$0.006</span>
                </div>
                {/* x402 fees */}
                {x402Payments.map((p, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <span style={{ fontSize: "12px", color: "#f59e0b", display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "8px", fontWeight: 700, padding: "1px 4px", borderRadius: "3px", backgroundColor: "#f59e0b20", border: "1px solid #f59e0b40" }}>402</span>
                      {p.memo.replace("x402: ", "")}
                    </span>
                    <span style={{ fontSize: "12px", color: "#f59e0b", fontFamily: "monospace", display: "flex", alignItems: "center", gap: "4px" }}>
                      <img src={SOL_LOGO_URL} alt="SOL" width={12} height={12} style={{ borderRadius: "50%" }} />
                      {p.amount} SOL
                    </span>
                  </div>
                ))}
                {/* Solana TX fees */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>Solana TX Fees (x{transactions.length})</span>
                  <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.8)", fontFamily: "monospace", display: "flex", alignItems: "center", gap: "4px" }}>
                    <img src={SOL_LOGO_URL} alt="SOL" width={12} height={12} style={{ borderRadius: "50%" }} />
                    ~{(transactions.length * 0.001).toFixed(3)} SOL
                  </span>
                </div>
                {/* Job Escrow */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>Job Escrow Amount</span>
                  <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.8)", fontFamily: "monospace", display: "flex", alignItems: "center", gap: "4px" }}>
                    <img src={USDC_LOGO_URL} alt="USDC" width={12} height={12} style={{ borderRadius: "50%" }} />
                    {String(specData?.amount || "—")} USDC
                  </span>
                </div>
              </div>
              {/* Totals */}
              <div
                style={{
                  marginTop: "12px",
                  paddingTop: "12px",
                  borderTop: "1px solid rgba(255,255,255,0.12)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>Total Protocol Cost</span>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#f59e0b", fontFamily: "monospace", display: "flex", alignItems: "center", gap: "4px" }}>
                    <img src={SOL_LOGO_URL} alt="SOL" width={14} height={14} style={{ borderRadius: "50%" }} />
                    {(x402Payments.reduce((sum, p) => sum + p.amount, 0) + transactions.length * 0.001).toFixed(3)} SOL
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>Total Job Value</span>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#ffffff", fontFamily: "monospace", display: "flex", alignItems: "center", gap: "4px" }}>
                    <img src={USDC_LOGO_URL} alt="USDC" width={14} height={14} style={{ borderRadius: "50%" }} />
                    {String(specData?.amount || "—")} USDC
                  </span>
                </div>
              </div>
            </div>
          )}
          {/* Performance Metrics */}
          {done && perfMetrics && (
            <div
              style={{
                backgroundColor: "rgba(0,0,0,0.4)",
                border: "1px solid rgba(147,197,253,0.2)",
                borderRadius: "10px",
                padding: "20px",
                backdropFilter: "blur(12px)",
                marginTop: "24px",
              }}
            >
              <div
                style={{
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "#93c5fd",
                  marginBottom: "16px",
                  fontWeight: 600,
                }}
              >
                Performance
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "20px", fontWeight: 700, color: "#42BDFF" }}>
                    {perfMetrics.alphaResponseTime !== null ? (perfMetrics.alphaResponseTime / 1000).toFixed(1) + "s" : "--"}
                  </div>
                  <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: "4px" }}>
                    Alpha Response
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "20px", fontWeight: 700, color: "#42BDFF" }}>
                    {perfMetrics.omegaResponseTime !== null ? (perfMetrics.omegaResponseTime / 1000).toFixed(1) + "s" : "--"}
                  </div>
                  <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: "4px" }}>
                    Omega Response
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "20px", fontWeight: 700, color: "#fff" }}>
                    {perfMetrics.totalRoundTime !== null ? (perfMetrics.totalRoundTime / 1000).toFixed(1) + "s" : "--"}
                  </div>
                  <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: "4px" }}>
                    Total Round Time
                  </div>
                </div>
              </div>
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "12px", display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                <span style={{ color: "rgba(255,255,255,0.4)" }}>
                  Est. Haiku Tokens: ~3,000 (3 calls x ~1,000)
                </span>
                <span style={{ color: "rgba(255,255,255,0.4)" }}>
                  Est. API Cost: ~$0.009 (3 x $0.003)
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
