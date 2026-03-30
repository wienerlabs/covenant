"use client";

import { useState, useRef, useEffect } from "react";
import { useConnector } from "@solana/connector/react";
import NavBar from "@/components/NavBar";
import { USDC_LOGO_URL, SOL_LOGO_URL } from "@/lib/constants";

const STEPS = ["CREATE", "ACCEPT", "SUBMIT", "COMPLETE"];

interface LogEntry {
  timestamp: string;
  message: string;
  type: "info" | "success" | "error" | "tx";
  txId: string | null;
  details: string | null;
}

function getTimestamp(): string {
  const now = new Date();
  return now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function DemoPage() {
  const { account } = useConnector();
  const [currentStep, setCurrentStep] = useState(-1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [buttonHover, setButtonHover] = useState(false);
  const logPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logPanelRef.current) {
      logPanelRef.current.scrollTop = logPanelRef.current.scrollHeight;
    }
  }, [logs]);

  function addLog(
    message: string,
    type: LogEntry["type"] = "info",
    txId: string | null = null,
    details: string | null = null
  ) {
    setLogs((prev) => [...prev, { timestamp: getTimestamp(), message, type, txId, details }]);
  }

  async function runDemo() {
    setRunning(true);
    setDone(false);
    setLogs([]);
    setCurrentStep(0);
    setCompletedSteps([]);

    const startTime = Date.now();
    const posterWallet = account || "demo-poster-" + Date.now().toString(36);
    const takerWallet = "demo-taker-" + Date.now().toString(36);

    // Step 1: Create job
    addLog("Initiating job creation...", "info");
    addLog("Posting to /api/jobs...", "info");
    try {
      const deadline = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const createRes = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posterWallet,
          amount: 25,
          minWords: 100,
          language: "en",
          deadline,
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        addLog("Failed to create job: " + (err.error || "Unknown error"), "error");
        setRunning(false);
        return;
      }

      const job = await createRes.json();
      addLog("Job created successfully", "success", null, `Job ID: ${job.id}`);
      addLog("Amount: 25.00 USDC locked in escrow", "info");
      addLog("Spec: minWords=100, language=en", "info");
      addLog(`Job ID: ${job.id.slice(0, 8)}...`, "info");
      if (job.txHash) {
        addLog("Solana tx confirmed", "tx", job.txHash, `Signature: ${job.txHash.slice(0, 16)}...`);
      }
      setCompletedSteps([0]);
      setCurrentStep(1);

      await sleep(2000);

      // Step 2: Accept job
      addLog("Finding available taker...", "info");
      addLog(`Accepting job ${job.id.slice(0, 8)}...`, "info");
      const acceptRes = await fetch(`/api/jobs/${job.id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ takerWallet }),
      });

      if (!acceptRes.ok) {
        const err = await acceptRes.json();
        addLog("Failed to accept job: " + (err.error || "Unknown error"), "error");
        setRunning(false);
        return;
      }

      const acceptData = await acceptRes.json();
      addLog("Job accepted by taker", "success");
      addLog(`Taker wallet: ${takerWallet.slice(0, 12)}...${takerWallet.slice(-4)}`, "info");
      if (acceptData.txHash) {
        addLog("Solana tx confirmed", "tx", acceptData.txHash, `Signature: ${acceptData.txHash.slice(0, 16)}...`);
      }
      setCompletedSteps([0, 1]);
      setCurrentStep(2);

      await sleep(2000);

      // Step 3: Submit work
      const demoText = Array.from({ length: 150 }, (_, i) =>
        ["covenant", "trustless", "escrow", "solana", "protocol", "verified", "proof", "delivery", "payment", "blockchain"][i % 10]
      ).join(" ");

      addLog("Generating work submission...", "info");
      addLog("Word count: 150 / 100 minimum", "info");
      addLog("Computing SHA-256 text hash...", "info");

      // Compute hash client-side for the log
      let displayHash = "0xabc123...";
      try {
        const encoder = new TextEncoder();
        const data = encoder.encode(demoText);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        displayHash = "0x" + hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12) + "...";
      } catch {
        // fallback to placeholder
      }

      addLog(`Text hash: ${displayHash}`, "info");
      addLog("Submitting work + proof...", "info");

      const submitRes = await fetch(`/api/jobs/${job.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          takerWallet,
          text: demoText,
          wordCount: 150,
        }),
      });

      if (!submitRes.ok) {
        const err = await submitRes.json();
        addLog("Failed to submit: " + (err.error || "Unknown error"), "error");
        setRunning(false);
        return;
      }

      const result = await submitRes.json();
      addLog("Work submitted and verified", "success", null, `hash=${result.submission.textHash.slice(0, 16)}...`);
      addLog("Amount: 25.00 USDC released to taker", "info");
      if (result.txHash) {
        addLog("Solana tx confirmed", "tx", result.txHash, `Signature: ${result.txHash.slice(0, 16)}...`);
      }
      setCompletedSteps([0, 1, 2, 3]);
      setCurrentStep(3);

      await sleep(1000);

      // Step 4: Complete
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      addLog("Lifecycle complete", "success");
      addLog(`Total time: ${elapsed}s`, "info");
      setDone(true);
    } catch (err) {
      addLog("Error: " + String(err), "error");
    } finally {
      setRunning(false);
    }
  }

  function resetDemo() {
    setCurrentStep(-1);
    setCompletedSteps([]);
    setLogs([]);
    setDone(false);
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
          backgroundColor: "rgba(0, 0, 0, 0.5)",
        }}
      />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 2 }}>
        <NavBar activeTab="arena" variant="dark" />

        {/* Center content */}
        <div
          style={{
            maxWidth: "700px",
            margin: "0 auto",
            padding: "48px 24px",
          }}
        >
          <h1
            style={{
              fontSize: "28px",
              fontWeight: 700,
              color: "#ffffff",
              textTransform: "uppercase",
              letterSpacing: "-0.01em",
              margin: "0 0 8px 0",
              textAlign: "center",
            }}
          >
            Live Protocol Demo
          </h1>
          <p
            style={{
              fontSize: "13px",
              color: "rgba(255,255,255,0.6)",
              margin: "0 0 40px 0",
              textAlign: "center",
            }}
          >
            Watch a complete job lifecycle in real-time
          </p>

          {/* Progress bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0",
              marginBottom: "32px",
            }}
          >
            {STEPS.map((step, i) => {
              const isCompleted = completedSteps.includes(i);
              const isActive = currentStep === i && !isCompleted;
              return (
                <div
                  key={step}
                  style={{
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: isCompleted
                          ? "2px solid #ffffff"
                          : isActive
                          ? "2px solid #ffffff"
                          : "2px solid rgba(255,255,255,0.3)",
                        backgroundColor: isCompleted
                          ? "#ffffff"
                          : "transparent",
                        color: isCompleted ? "#000000" : "#ffffff",
                        fontSize: "12px",
                        fontWeight: 700,
                        animation: isActive ? "pulse 1.5s ease-in-out infinite" : "none",
                      }}
                    >
                      {isCompleted ? "^" : i + 1}
                    </div>
                    <span
                      style={{
                        fontSize: "10px",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: isCompleted || isActive
                          ? "#ffffff"
                          : "rgba(255,255,255,0.3)",
                        fontWeight: isActive ? 700 : 400,
                      }}
                    >
                      {step}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div
                      style={{
                        width: "60px",
                        height: "2px",
                        backgroundColor: completedSteps.includes(i)
                          ? "rgba(255,255,255,0.6)"
                          : "rgba(255,255,255,0.15)",
                        margin: "0 12px",
                        marginBottom: "24px",
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Log panel -- terminal */}
          <div
            style={{
              backgroundColor: "rgba(0,0,0,0.6)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "8px",
              marginBottom: "24px",
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
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#febc2e", display: "inline-block" }} />
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#28c840", display: "inline-block" }} />
              <span
                style={{
                  marginLeft: "8px",
                  fontSize: "11px",
                  color: "rgba(255,255,255,0.4)",
                  letterSpacing: "0.03em",
                }}
              >
                covenant-protocol -- terminal
              </span>
            </div>

            {/* Log entries */}
            <div
              ref={logPanelRef}
              style={{
                padding: "16px",
                minHeight: "160px",
                maxHeight: "400px",
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
                  Press START DEMO to begin
                </div>
              ) : (
                logs.map((log, i) => {
                  const dotColor =
                    log.type === "success"
                      ? "#28c840"
                      : log.type === "error"
                      ? "#ff5f57"
                      : log.type === "tx"
                      ? "#febc2e"
                      : "#5ba4f5";

                  // Render message with inline USDC logo for amounts like "25.00 USDC"
                  const usdcPattern = /(\d+\.\d{2}\s+USDC)/g;
                  const usdcCheck = /^\d+\.\d{2}\s+USDC$/;
                  const parts = log.message.split(usdcPattern);
                  const renderedMessage = parts.map((part, pi) => {
                    if (usdcCheck.test(part)) {
                      return (
                        <span key={pi} style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                          <img src={USDC_LOGO_URL} alt="USDC" width={16} height={16} style={{ borderRadius: "50%", verticalAlign: "middle" }} />
                          {part}
                        </span>
                      );
                    }
                    return <span key={pi}>{part}</span>;
                  });

                  return (
                    <div
                      key={i}
                      style={{
                        marginBottom: "6px",
                        lineHeight: 1.6,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          alignItems: "baseline",
                        }}
                      >
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
                            color:
                              log.type === "success"
                                ? "#86efac"
                                : log.type === "error"
                                ? "#fca5a5"
                                : log.type === "tx"
                                ? "#fde68a"
                                : "rgba(255,255,255,0.85)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            flexWrap: "wrap",
                          }}
                        >
                          {log.type === "tx" && (
                            <img src={SOL_LOGO_URL} alt="SOL" width={14} height={14} style={{ borderRadius: "50%", verticalAlign: "middle" }} />
                          )}
                          {renderedMessage}
                          {log.txId && (
                            <a
                              href={`https://explorer.solana.com/tx/${log.txId}?cluster=devnet`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                marginLeft: "8px",
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
                      {log.details && (
                        <div
                          style={{
                            paddingLeft: "calc(10px + 6px + 8px + 8px)",
                            fontSize: "10px",
                            color: "rgba(255,255,255,0.3)",
                            marginTop: "1px",
                          }}
                        >
                          {log.details}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Button */}
          <div style={{ textAlign: "center" }}>
            <button
              onClick={done ? () => { resetDemo(); } : runDemo}
              disabled={running}
              onMouseEnter={() => setButtonHover(true)}
              onMouseLeave={() => setButtonHover(false)}
              style={{
                fontFamily: "inherit",
                fontSize: "13px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                padding: "12px 32px",
                cursor: running ? "not-allowed" : "pointer",
                border: "1px solid #ffffff",
                borderRadius: "6px",
                backgroundColor:
                  running
                    ? "rgba(255,255,255,0.05)"
                    : buttonHover
                    ? "rgba(255,255,255,0.15)"
                    : "rgba(255,255,255,0.1)",
                color: running ? "rgba(255,255,255,0.3)" : "#ffffff",
                backdropFilter: "blur(8px)",
                transition: "all 0.2s ease",
              }}
            >
              {running
                ? "Running..."
                : done
                ? "Reset & Run Again"
                : "Start Demo"}
            </button>
          </div>

          {account && (
            <div
              style={{
                marginTop: "16px",
                fontSize: "11px",
                color: "rgba(255,255,255,0.4)",
                textAlign: "center",
              }}
            >
              Using connected wallet as poster: {account.slice(0, 4)}...{account.slice(-4)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
