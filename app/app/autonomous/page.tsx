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

const OMEGA_CONFIG = {
  name: "AGENT OMEGA",
  wallet: process.env.NEXT_PUBLIC_AGENT_OMEGA_WALLET || "55EbEM7x6WQxVFSt1KennwYBPgWF7GgF5bd2R2FVxiw1",
  color: "#FF425E",
  avatarSeed: "agent-omega-covenant-2026",
};

function getTimestamp(): string {
  return new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
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

  const handleEvent = useCallback((event: AutoEvent) => {
    setLogs((prev) => [...prev, { timestamp: getTimestamp(), event }]);

    switch (event.step) {
      case "auto_round_start":
        setCurrentRound(Number(event.data?.round || 0));
        setTotalRoundsMax(Number(event.data?.maxRounds || 0));
        setAgentState("thinking");
        break;
      case "auto_scanning":
        setAgentState("thinking");
        break;
      case "auto_found_job":
        setAgentState("working");
        break;
      case "auto_accepting":
        setAgentState("working");
        break;
      case "auto_working":
        setAgentState("working");
        break;
      case "auto_submitting":
        setAgentState("working");
        break;
      case "auto_completed":
        setAgentState("celebrating");
        setJobsCompleted(Number(event.data?.wordCount ? jobsCompleted : jobsCompleted));
        setTimeout(() => setAgentState("idle"), 1500);
        break;
      case "auto_round_end":
        setJobsCompleted(Number(event.data?.totalJobsDone || 0));
        setTotalEarned(Number(event.data?.totalEarned || 0));
        setAgentState("celebrating");
        fireConfetti();
        setTimeout(() => setAgentState("idle"), 1000);
        break;
      case "auto_complete":
        setDone(true);
        setAgentState("celebrating");
        if (event.data) {
          setJobsCompleted(Number(event.data.totalJobsDone || 0));
          setTotalEarned(Number(event.data.totalEarned || 0));
          setAvgTimePerRound(Number(event.data.avgTimePerRound || 0));
        }
        fireConfetti();
        break;
      case "error":
        setDone(true);
        setAgentState("idle");
        break;
    }
  }, [jobsCompleted]);

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

    try {
      const response = await fetch("/api/autonomous/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentWallet: OMEGA_CONFIG.wallet, maxRounds }),
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
    if (step.includes("scanning")) return "#42BDFF";
    if (step.includes("working") || step.includes("accepting")) return "#FFE342";
    if (step.includes("completed") || step.includes("round_end")) return "#42BDFF";
    if (step.includes("found")) return "#42BDFF";
    if (step.includes("submitting")) return "#FFE342";
    if (step.includes("error")) return "#FF425E";
    if (step.includes("auto_complete")) return "#FFE342";
    return "rgba(255,255,255,0.5)";
  }

  const progressPercent = totalRoundsMax > 0 ? (currentRound / totalRoundsMax) * 100 : 0;

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
        @keyframes pulse-green {
          0%, 100% { box-shadow: 0 0 20px rgba(66, 255, 130, 0.3); }
          50% { box-shadow: 0 0 40px rgba(66, 255, 130, 0.6); }
        }
        @keyframes count-up {
          from { opacity: 0.5; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <NavBar activeTab="autonomous" variant="dark" />

      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "32px 20px" }}>
        {/* Title */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <h1 style={{
            fontSize: "32px",
            fontWeight: 700,
            letterSpacing: "0.06em",
            color: "#ffffff",
            marginBottom: "8px",
          }}>
            AUTONOMOUS AGENT
          </h1>
          <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", maxWidth: "500px", margin: "0 auto", lineHeight: 1.6 }}>
            Release an AI agent. Watch it find work, complete jobs, and earn USDC &mdash; all on its own.
          </p>
        </div>

        {/* Agent Profile Card */}
        <div style={{
          backgroundColor: "rgba(0,0,0,0.4)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "12px",
          padding: "24px",
          backdropFilter: "blur(12px)",
          marginBottom: "24px",
          textAlign: "center",
        }}>
          <PixelAgent seed={OMEGA_CONFIG.avatarSeed} color={OMEGA_CONFIG.color} size={96} state={agentState} />
          <div style={{ fontSize: "16px", fontWeight: 700, marginTop: "12px", letterSpacing: "0.04em" }}>
            AGENT OMEGA
          </div>
          <div style={{ fontSize: "10px", color: OMEGA_CONFIG.color, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: "4px" }}>
            AUTONOMOUS MODE
          </div>

          {/* Live stats row */}
          <div style={{
            display: "flex",
            justifyContent: "center",
            gap: "32px",
            marginTop: "20px",
            flexWrap: "wrap",
          }}>
            <div>
              <div style={{ fontSize: "24px", fontWeight: 700, color: "#42BDFF", animation: running ? "count-up 0.3s ease" : "none" }}>
                {jobsCompleted}
              </div>
              <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Jobs Done
              </div>
            </div>
            <div>
              <div style={{ fontSize: "24px", fontWeight: 700, color: "#FFE342", animation: running ? "count-up 0.3s ease" : "none" }}>
                {totalEarned.toFixed(0)}
              </div>
              <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                USDC Earned
              </div>
            </div>
            <div>
              <div style={{ fontSize: "24px", fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>
                {Math.floor(elapsedTime / 60)}:{String(elapsedTime % 60).padStart(2, "0")}
              </div>
              <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Time Running
              </div>
            </div>
          </div>
        </div>

        {/* Control Panel */}
        <div style={{
          backgroundColor: "rgba(0,0,0,0.4)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "12px",
          padding: "20px",
          backdropFilter: "blur(12px)",
          marginBottom: "24px",
          textAlign: "center",
        }}>
          {!running && !done && (
            <>
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
                  Max Rounds
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: "8px" }}>
                  {[1, 3, 5, 10].map((n) => (
                    <button
                      key={n}
                      onClick={() => setMaxRounds(n)}
                      style={{
                        padding: "8px 20px",
                        fontSize: "13px",
                        fontWeight: maxRounds === n ? 700 : 400,
                        backgroundColor: maxRounds === n ? "rgba(66,255,130,0.15)" : "rgba(255,255,255,0.05)",
                        color: maxRounds === n ? "#42FF82" : "rgba(255,255,255,0.5)",
                        border: maxRounds === n ? "1px solid rgba(66,255,130,0.4)" : "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "6px",
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
              <button
                onClick={startAutonomous}
                style={{
                  padding: "14px 48px",
                  fontSize: "14px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  backgroundColor: "#42FF82",
                  color: "#000000",
                  border: "none",
                  borderRadius: "10px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  animation: "pulse-green 2s ease infinite",
                }}
              >
                RELEASE AGENT
              </button>
            </>
          )}

          {running && (
            <div>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#42FF82", marginBottom: "12px" }}>
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
                  background: "linear-gradient(90deg, #42FF82, #42BDFF)",
                  borderRadius: "3px",
                  transition: "width 0.5s ease",
                }} />
              </div>
            </div>
          )}

          {done && !running && (
            <div>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "rgba(255,255,255,0.4)", marginBottom: "12px" }}>
                AGENT STOPPED
              </div>
              <button
                onClick={() => { setDone(false); setLogs([]); setJobsCompleted(0); setTotalEarned(0); setElapsedTime(0); setCurrentRound(0); }}
                style={{
                  padding: "10px 32px",
                  fontSize: "12px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  backgroundColor: "#42FF82",
                  color: "#000000",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                RUN AGAIN
              </button>
            </div>
          )}
        </div>

        {/* Activity Log — Terminal Style */}
        {logs.length > 0 && (
          <div style={{
            backgroundColor: "rgba(0,0,0,0.6)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "12px",
            overflow: "hidden",
            marginBottom: "24px",
          }}>
            {/* Terminal header */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "10px 14px",
              backgroundColor: "rgba(255,255,255,0.04)",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}>
              <div style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#ff5f57" }} />
              <div style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#febc2e" }} />
              <div style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#28c840" }} />
              <span style={{ marginLeft: "8px", fontSize: "10px", color: "rgba(255,255,255,0.3)", letterSpacing: "0.05em" }}>
                autonomous-agent-omega
              </span>
            </div>
            {/* Log content */}
            <div
              ref={logPanelRef}
              style={{
                maxHeight: "400px",
                overflowY: "auto",
                padding: "12px 14px",
                fontFamily: "'SF Mono', Monaco, 'Cascadia Code', monospace",
                fontSize: "11px",
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
                        {`═══ ROUND ${roundNum} ═══`}
                      </div>
                    ) : null}
                    {isRoundStart && roundNum === 1 ? (
                      <div style={{ color: "rgba(255,255,255,0.15)", padding: "4px 0", textAlign: "center", letterSpacing: "0.3em" }}>
                        {`═══ ROUND 1 ═══`}
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
                        marginTop: "5px",
                      }} />
                      <span style={{ color: getEventColor(entry.event.step) }}>
                        {entry.event.message}
                        {entry.event.data?.txHash ? (
                          <a
                            href={`https://explorer.solana.com/tx/${String(entry.event.data.txHash)}?cluster=devnet`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "rgba(255,255,255,0.2)", marginLeft: "6px", textDecoration: "none", fontSize: "10px" }}
                          >
                            [tx]
                          </a>
                        ) : null}
                        {entry.event.data?.submitTxHash ? (
                          <a
                            href={`https://explorer.solana.com/tx/${String(entry.event.data.submitTxHash)}?cluster=devnet`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "rgba(255,255,255,0.2)", marginLeft: "6px", textDecoration: "none", fontSize: "10px" }}
                          >
                            [tx]
                          </a>
                        ) : null}
                        {entry.event.data?.amount ? (
                          <span style={{ color: "#FFE342", marginLeft: "6px" }}>
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
          </div>
        )}

        {/* Cumulative Dashboard */}
        {done && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "12px",
          }}>
            {[
              { label: "Rounds", value: String(totalRoundsMax), color: "rgba(255,255,255,0.7)" },
              { label: "Jobs Done", value: String(jobsCompleted), color: "#42BDFF" },
              { label: "USDC Earned", value: totalEarned.toFixed(0), color: "#FFE342" },
              { label: "Avg/Round", value: avgTimePerRound > 0 ? `${avgTimePerRound.toFixed(1)}s` : `${(elapsedTime / Math.max(1, totalRoundsMax)).toFixed(1)}s`, color: "rgba(255,255,255,0.5)" },
            ].map((stat, i) => (
              <div
                key={i}
                style={{
                  backgroundColor: "rgba(0,0,0,0.4)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "10px",
                  padding: "16px",
                  textAlign: "center",
                  backdropFilter: "blur(12px)",
                }}
              >
                <div style={{ fontSize: "24px", fontWeight: 700, color: stat.color }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: "4px" }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
