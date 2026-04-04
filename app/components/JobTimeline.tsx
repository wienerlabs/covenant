"use client";

import { SOL_LOGO_URL } from "@/lib/constants";

interface Submission {
  id: string;
  takerWallet: string;
  textHash: string;
  wordCount: number;
  verified: boolean;
  txHash?: string | null;
  createdAt: string;
}

interface Job {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  txHash?: string | null;
}

interface JobTimelineProps {
  job: Job;
  submissions: Submission[];
}

function formatTs(dateStr: string): string {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${y}-${mo}-${da} ${h}:${mi}:${s}`;
}

interface StepDef {
  key: string;
  label: string;
  active: boolean;
  color: string;
  icon: string;
  timestamp?: string;
  detail?: string;
  txHash?: string | null;
}

export default function JobTimeline({ job, submissions }: JobTimelineProps) {
  const steps: StepDef[] = [];

  // CREATED — always present
  steps.push({
    key: "created",
    label: "Created",
    active: true,
    color: "#FFE342",
    icon: "\u25CF",
    timestamp: job.createdAt,
    txHash: job.txHash,
  });

  // ACCEPTED — if status is not "Open"
  if (job.status !== "Open") {
    steps.push({
      key: "accepted",
      label: "Accepted",
      active: true,
      color: "#42BDFF",
      icon: "\u25CF",
      timestamp: job.updatedAt,
    });
  }

  // SUBMITTED — if there are submissions
  if (submissions.length > 0) {
    const totalWords = submissions.reduce((s, sub) => s + sub.wordCount, 0);
    const latestSub = submissions[submissions.length - 1];
    steps.push({
      key: "submitted",
      label: "Submitted",
      active: true,
      color: "#93c5fd",
      icon: "\u25CF",
      timestamp: latestSub.createdAt,
      detail: `${totalWords.toLocaleString()} words`,
      txHash: latestSub.txHash,
    });
  }

  // COMPLETED
  if (job.status === "Completed") {
    steps.push({
      key: "completed",
      label: "Completed",
      active: true,
      color: "#FFE342",
      icon: "\u2713",
      timestamp: job.updatedAt,
    });
  }

  // CANCELLED
  if (job.status === "Cancelled") {
    steps.push({
      key: "cancelled",
      label: "Cancelled",
      active: true,
      color: "#fca5a5",
      icon: "\u2717",
      timestamp: job.updatedAt,
    });
  }

  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: "12px",
        backgroundColor: "rgba(255,255,255,0.07)",
        backdropFilter: "blur(16px)",
        padding: "28px",
      }}
    >
      <div
        style={{
          fontSize: "10px",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: "rgba(255,255,255,0.4)",
          marginBottom: "20px",
        }}
      >
        Job Timeline
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
        {steps.map((step, i) => (
          <div key={step.key} style={{ display: "flex", gap: "16px" }}>
            {/* Vertical line + dot */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: "24px",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: step.color,
                  border: `2px solid ${step.color}`,
                  backgroundColor: `${step.color}20`,
                  flexShrink: 0,
                }}
              >
                {step.icon}
              </div>
              {i < steps.length - 1 && (
                <div
                  style={{
                    width: "2px",
                    flex: 1,
                    minHeight: "20px",
                    backgroundColor: "rgba(255,255,255,0.12)",
                  }}
                />
              )}
            </div>

            {/* Content */}
            <div style={{ paddingBottom: i < steps.length - 1 ? "16px" : "0", flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#fff",
                  marginBottom: "2px",
                }}
              >
                {step.label}
              </div>
              {step.timestamp && (
                <div
                  style={{
                    fontSize: "10px",
                    color: "rgba(255,255,255,0.4)",
                    marginBottom: "2px",
                  }}
                >
                  {formatTs(step.timestamp)}
                </div>
              )}
              {step.detail && (
                <div
                  style={{
                    fontSize: "11px",
                    color: "rgba(255,255,255,0.6)",
                    marginBottom: "2px",
                  }}
                >
                  {step.detail}
                </div>
              )}
              {step.txHash && (
                <a
                  href={`https://explorer.solana.com/tx/${step.txHash}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: "10px",
                    color: "#5ba4f5",
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <img
                    src={SOL_LOGO_URL}
                    alt="SOL"
                    width={10}
                    height={10}
                    style={{ borderRadius: "50%" }}
                  />
                  {step.txHash.slice(0, 12)}...
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
