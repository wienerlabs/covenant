"use client";

/**
 * Small presentational helpers shared by the /credit page and its
 * companion components (drawer, activity feed, leaderboard, etc.).
 *
 * Kept in one file to avoid a proliferation of 20-line components.
 */

import { useState } from "react";

const GRADE_COLOR: Record<string, string> = {
  "A+": "#7CFF7C",
  A: "#7CFF7C",
  B: "#FFEC70",
  C: "#FFB84D",
  D: "#FF425E",
};

export interface ReputationSummary {
  jobsCompleted: number;
  jobsFailed: number;
  jobsDisputed: number;
  totalEarned: number;
  riskGrade: "A+" | "A" | "B" | "C" | "D";
}

/**
 * Compact risk-score pill. Shows letter grade + key reputation stats.
 * Renders a subtle color-coded background derived from grade.
 */
export function RiskPill({ rep }: { rep: ReputationSummary }) {
  const color = GRADE_COLOR[rep.riskGrade] ?? "#FFB84D";
  const total = rep.jobsCompleted + rep.jobsFailed;
  return (
    <span
      title={`${rep.jobsCompleted} completed · ${rep.jobsFailed} failed · ${rep.jobsDisputed} disputed · $${rep.totalEarned.toFixed(2)} earned`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.04em",
        color,
        background: `${color}18`,
        border: `1px solid ${color}40`,
        whiteSpace: "nowrap",
      }}
    >
      <span>{rep.riskGrade}</span>
      <span style={{ color: "rgba(255,255,255,0.45)" }}>·</span>
      <span style={{ color: "rgba(255,255,255,0.7)" }}>
        {total} {total === 1 ? "job" : "jobs"}
      </span>
      {rep.jobsDisputed > 0 && (
        <>
          <span style={{ color: "rgba(255,255,255,0.45)" }}>·</span>
          <span style={{ color: "#FF425E" }}>{rep.jobsDisputed}d</span>
        </>
      )}
    </span>
  );
}

/**
 * Tiny link badge to Solana Explorer / Solscan for a given pubkey or
 * tx signature. Opens in a new tab.
 */
export function SolscanLink({
  value,
  kind = "address",
  label = "Solscan",
  cluster = "devnet",
}: {
  value: string;
  kind?: "address" | "tx";
  label?: string;
  cluster?: "devnet";
}) {
  const base = "https://solscan.io";
  const path = kind === "tx" ? "tx" : "account";
  const href = `${base}/${path}/${value}?cluster=${cluster}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 600,
        color: "rgba(255,255,255,0.6)",
        textDecoration: "none",
        border: "1px solid rgba(255,255,255,0.15)",
        background: "rgba(255,255,255,0.04)",
        whiteSpace: "nowrap",
      }}
    >
      {label} ↗
    </a>
  );
}

/**
 * A tiny ⓘ button that opens a modal explaining dispute risk. Gives
 * lenders a clear "what could go wrong" answer before they click Buy.
 */
export function RiskDisclosureButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: "4px 10px",
          fontFamily: "inherit",
          fontSize: 11,
          fontWeight: 600,
          color: "rgba(255,255,255,0.7)",
          background: "transparent",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 4,
          cursor: "pointer",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        ⓘ Risk disclosure
      </button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(6px)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 520,
              background: "#111",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12,
              padding: 28,
              color: "#fff",
              fontFamily: "inherit",
              lineHeight: 1.6,
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
              What could go wrong?
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
              <p>
                When you buy a claim, you pay the seller the listed price
                today and inherit their right to collect the full face value
                when <code>finalize_payment</code> fires on chain.
              </p>
              <p style={{ color: "#FF425E", fontWeight: 600 }}>
                If a dispute is raised during the 24h challenge window and
                resolves <b>FavorPoster</b>, the escrow is refunded to the
                poster — and you lose your principal.
              </p>
              <p>
                This risk is priced into the discount. A 3% discount across a
                24h window is <b>~1095% APR</b>: that yield exists precisely
                because you are the party underwriting the dispute outcome.
              </p>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                The program is fully on-chain (seeds:{" "}
                <code>[&quot;claim&quot;, job_escrow]</code>). Settlement
                routing is enforced by the <code>claim_listing</code> PDA
                being a required account on every <code>finalize_payment</code>{" "}
                and <code>resolve_dispute</code> — no crank can bypass it.
              </p>
            </div>
            <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => setOpen(false)}
                style={{
                  padding: "10px 18px",
                  fontFamily: "inherit",
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#000",
                  background: "#fffeb2",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Format a wallet string as 4…4. */
export function shortWallet(w: string): string {
  return w.length > 10 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w;
}

/** Human-readable duration from seconds. */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "expired";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  const s = Math.max(0, seconds - m * 60);
  return `${m}m ${s}s`;
}
