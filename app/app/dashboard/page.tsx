"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useConnector } from "@solana/connector/react";
import NavBar from "@/components/NavBar";
import UserAvatar from "@/components/UserAvatar";
import StatusBadge from "@/components/StatusBadge";
import ReputationScore from "@/components/ReputationScore";
import { StatCardSkeleton, JobCardSkeleton } from "@/components/LoadingSkeleton";
import useProfile from "@/hooks/useProfile";
import useReputation from "@/hooks/useReputation";
import useWalletBalance from "@/hooks/useWalletBalance";
import CopyButton from "@/components/CopyButton";
import DIDBadge from "@/components/DIDBadge";
import EmptyState from "@/components/EmptyState";
import Pagination from "@/components/Pagination";
import { formatAddress } from "@/lib/format";
import { USDC_LOGO_URL, SOL_LOGO_URL } from "@/lib/constants";
import { getCategoryById } from "@/lib/categories";

/* ---------- Types ---------- */

interface DashSubmission {
  id: string;
  outputText?: string | null;
  wordCount: number;
  verified: boolean;
  textHash: string;
}

interface JobData {
  id: string;
  posterWallet: string;
  takerWallet: string | null;
  amount: number;
  paymentToken: string;
  status: string;
  category: string;
  minWords: number;
  deadline: string;
  createdAt: string;
  specJson: Record<string, unknown>;
  submissions?: DashSubmission[];
}

interface TxData {
  id: string;
  txHash: string;
  type: string;
  amount: number;
  wallet: string;
  createdAt: string;
}

interface NotificationData {
  id: string;
  type: string;
  message: string;
  createdAt: string;
  read: boolean;
}

interface ActivityEvent {
  id: string;
  type: string;
  description: string;
  createdAt: string;
  txHash?: string;
}

/* ---------- Helpers ---------- */

const SECTION_HEADER: React.CSSProperties = {
  fontSize: "11px",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: "rgba(255,255,255,0.4)",
  marginBottom: "16px",
  fontWeight: 600,
};

const GLASS_CARD: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "12px",
  backgroundColor: "rgba(0,0,0,0.3)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
};

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const EVENT_COLORS: Record<string, string> = {
  job_created: "#42BDFF",
  create_job: "#42BDFF",
  job_accepted: "#FFE342",
  accept_job: "#FFE342",
  job_completed: "#22c55e",
  submit_completion: "#22c55e",
  job_cancelled: "#FF425E",
  payment_released: "#22c55e",
  escrow_release: "#22c55e",
  escrow_lock: "#a855f7",
  x402_payment: "#ec4899",
};

const EVENT_LABELS: Record<string, string> = {
  job_created: "Job Created",
  create_job: "Job Created",
  job_accepted: "Job Accepted",
  accept_job: "Job Accepted",
  job_completed: "Job Completed",
  submit_completion: "Completion Submitted",
  job_cancelled: "Job Cancelled",
  payment_released: "Payment Released",
  escrow_release: "Escrow Released",
  escrow_lock: "Escrow Locked",
  x402_payment: "x402 Payment",
};

/* ---------- Component ---------- */

export default function DashboardPage() {
  const { isConnected, account } = useConnector();
  const wallet = isConnected && account ? account : undefined;
  const { profile, loading: profileLoading } = useProfile(wallet);
  const { reputation } = useReputation(wallet);
  const { sol, usdc, loading: balanceLoading, refetch: refetchBalance } = useWalletBalance(wallet);

  const [tab, setTab] = useState<"posted" | "taken">("posted");
  const [postedJobs, setPostedJobs] = useState<JobData[]>([]);
  const [takenJobs, setTakenJobs] = useState<JobData[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [faucetMsg, setFaucetMsg] = useState<string | null>(null);
  const [jobPage, setJobPage] = useState(1);
  const JOBS_PER_PAGE = 10;

  const fetchData = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    try {
      const [posterRes, takerRes, txRes, notifRes] = await Promise.all([
        fetch(`/api/jobs?poster=${wallet}`),
        fetch(`/api/jobs?taker=${wallet}`),
        fetch(`/api/transactions?wallet=${wallet}`),
        fetch(`/api/notifications/${wallet}`).catch(() => null),
      ]);

      if (posterRes.ok) {
        const d = await posterRes.json();
        setPostedJobs(Array.isArray(d) ? d : (d.jobs || []));
      }
      if (takerRes.ok) {
        const d = await takerRes.json();
        setTakenJobs(Array.isArray(d) ? d : (d.jobs || []));
      }

      // Merge transactions + notifications into unified activity timeline
      const events: ActivityEvent[] = [];

      if (txRes.ok) {
        const txData: TxData[] = await txRes.json();
        const txArr = Array.isArray(txData) ? txData : [];
        for (const tx of txArr) {
          events.push({
            id: tx.id,
            type: tx.type,
            description: tx.amount > 0
              ? `${EVENT_LABELS[tx.type] || tx.type.replace(/_/g, " ")} - $${tx.amount.toFixed(2)}`
              : (EVENT_LABELS[tx.type] || tx.type.replace(/_/g, " ")),
            createdAt: tx.createdAt,
            txHash: tx.txHash,
          });
        }
      }

      if (notifRes && notifRes.ok) {
        try {
          const notifData: NotificationData[] = await notifRes.json();
          const nArr = Array.isArray(notifData) ? notifData : [];
          for (const n of nArr) {
            // avoid duplicates by checking if there's already a tx event close in time
            events.push({
              id: `notif-${n.id}`,
              type: n.type,
              description: n.message,
              createdAt: n.createdAt,
            });
          }
        } catch {
          // notifications may not be array
        }
      }

      // Deduplicate by id, sort by date desc, limit to 15
      const seen = new Set<string>();
      const unique = events.filter((e) => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      });
      unique.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setActivity(unique.slice(0, 15));
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    fetchData().then(() => refetchBalance());
  }, [fetchData, refetchBalance]);

  // Reset page when tab changes
  useEffect(() => {
    setJobPage(1);
  }, [tab]);

  async function handleFaucet() {
    if (!wallet) return;
    setFaucetLoading(true);
    setFaucetMsg(null);
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: wallet }),
      });
      if (res.ok) {
        setFaucetMsg("Test USDC sent!");
        refetchBalance();
        setTimeout(() => refetchBalance(), 3000);
      } else {
        const d = await res.json().catch(() => ({}));
        setFaucetMsg(d.error || "Faucet request failed");
      }
    } catch {
      setFaucetMsg("Network error");
    } finally {
      setFaucetLoading(false);
      setTimeout(() => setFaucetMsg(null), 4000);
    }
  }

  /* Stats */
  const jobsPostedCount = postedJobs.length;
  const jobsTakenCount = takenJobs.length;
  const totalEarned = reputation.totalEarned;
  const completedCount = reputation.jobsCompleted;
  const failedCount = reputation.jobsFailed;
  const successRate = completedCount + failedCount > 0
    ? Math.round((completedCount / (completedCount + failedCount)) * 100)
    : 100;

  /* Paginated jobs */
  const currentJobs = tab === "posted" ? postedJobs : takenJobs;
  const sortedJobs = [...currentJobs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const totalPages = Math.max(1, Math.ceil(sortedJobs.length / JOBS_PER_PAGE));
  const pagedJobs = sortedJobs.slice((jobPage - 1) * JOBS_PER_PAGE, jobPage * JOBS_PER_PAGE);

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: "inherit",
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    padding: "8px 24px",
    cursor: "pointer",
    border: active ? "1px solid #42BDFF" : "1px solid rgba(255,255,255,0.2)",
    borderRadius: "6px",
    backgroundColor: active ? "rgba(66,189,255,0.12)" : "transparent",
    color: active ? "#42BDFF" : "rgba(255,255,255,0.5)",
    backdropFilter: "blur(4px)",
    transition: "all 0.15s ease",
    fontWeight: active ? 600 : 400,
  });

  /* ---------- Not connected ---------- */
  if (!isConnected) {
    return (
      <div style={{ minHeight: "100vh", fontFamily: "inherit", position: "relative" }}>
        <div style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "url('/poster-bg.png')", backgroundSize: "cover", backgroundPosition: "center" }} />
        <div style={{ position: "fixed", inset: 0, zIndex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)" }} />
        <div style={{ position: "relative", zIndex: 2 }}>
          <NavBar activeTab="dashboard" variant="dark" />
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "24px", fontWeight: 700, color: "#ffffff", marginBottom: "12px" }}>
                Connect Your Wallet
              </div>
              <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)" }}>
                Connect a Solana wallet to view your dashboard.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- Main dashboard ---------- */
  return (
    <div style={{ minHeight: "100vh", fontFamily: "inherit", position: "relative" }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "url('/poster-bg.png')", backgroundSize: "cover", backgroundPosition: "center" }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)" }} />

      <div style={{ position: "relative", zIndex: 2 }}>
        <NavBar activeTab="dashboard" variant="dark" />

        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "32px 24px", display: "flex", flexDirection: "column", gap: "36px" }}>

          {/* ── Section 1: Welcome Header ── */}
          <div style={{
            ...GLASS_CARD,
            padding: "28px 32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "20px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
              {profileLoading ? (
                <div className="shimmer" style={{ width: 72, height: 72, borderRadius: "8px" }} />
              ) : profile ? (
                <UserAvatar seed={profile.avatarSeed} avatarUrl={profile.avatarUrl ?? null} size={72} />
              ) : null}
              <div>
                <div style={{ fontSize: "24px", fontWeight: 700, color: "#ffffff", marginBottom: "6px" }}>
                  {profileLoading ? "Loading..." : profile ? `Welcome back, ${profile.displayName}` : "Dashboard"}
                </div>
                {wallet && (
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", fontFamily: "monospace" }}>
                      {formatAddress(wallet)}
                    </span>
                    <CopyButton text={wallet} />
                    <DIDBadge walletAddress={wallet} compact />
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <ReputationScore completed={reputation.jobsCompleted} failed={reputation.jobsFailed} />
              <Link
                href="/profile"
                style={{
                  fontFamily: "inherit",
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  textDecoration: "none",
                  padding: "8px 20px",
                  border: "1px solid rgba(255,255,255,0.25)",
                  borderRadius: "6px",
                  color: "rgba(255,255,255,0.7)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  transition: "all 0.15s ease",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#42BDFF"; e.currentTarget.style.color = "#42BDFF"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
              >
                Edit Profile
              </Link>
            </div>
          </div>

          {/* ── Section 2: Stats Grid ── */}
          <div>
            <div style={SECTION_HEADER}>Overview</div>
            <div
              className="dashboard-stats"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "16px",
              }}
            >
              {loading ? (
                <>
                  <StatCardSkeleton />
                  <StatCardSkeleton />
                  <StatCardSkeleton />
                  <StatCardSkeleton />
                </>
              ) : (
                <>
                  {/* Jobs Posted */}
                  <div style={{ ...GLASS_CARD, padding: "24px 20px", textAlign: "center" }}>
                    <div style={{ marginBottom: "10px" }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#42BDFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="12" y1="18" x2="12" y2="12" />
                        <line x1="9" y1="15" x2="15" y2="15" />
                      </svg>
                    </div>
                    <div style={{ fontSize: "28px", fontWeight: 700, color: "#ffffff" }}>{jobsPostedCount}</div>
                    <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: "6px" }}>
                      Jobs Posted
                    </div>
                    <Link href="/poster" style={{ fontSize: "9px", color: "#42BDFF", textDecoration: "none", marginTop: "8px", display: "inline-block", letterSpacing: "0.05em" }}>
                      View all &rarr;
                    </Link>
                  </div>

                  {/* Jobs Taken */}
                  <div style={{ ...GLASS_CARD, padding: "24px 20px", textAlign: "center" }}>
                    <div style={{ marginBottom: "10px" }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFE342" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                      </svg>
                    </div>
                    <div style={{ fontSize: "28px", fontWeight: 700, color: "#ffffff" }}>{jobsTakenCount}</div>
                    <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: "6px" }}>
                      Jobs Taken
                    </div>
                    <Link href="/taker" style={{ fontSize: "9px", color: "#FFE342", textDecoration: "none", marginTop: "8px", display: "inline-block", letterSpacing: "0.05em" }}>
                      View all &rarr;
                    </Link>
                  </div>

                  {/* Total Earned */}
                  <div style={{ ...GLASS_CARD, padding: "24px 20px", textAlign: "center" }}>
                    <div style={{ marginBottom: "10px" }}>
                      <img src={USDC_LOGO_URL} alt="USDC" width={20} height={20} style={{ borderRadius: "50%" }} />
                    </div>
                    <div style={{ fontSize: "28px", fontWeight: 700, color: "#ffffff", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      ${totalEarned.toFixed(2)}
                    </div>
                    <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: "6px" }}>
                      Total Earned
                    </div>
                  </div>

                  {/* Success Rate */}
                  <div style={{ ...GLASS_CARD, padding: "24px 20px", textAlign: "center" }}>
                    <div style={{ marginBottom: "10px" }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={successRate >= 80 ? "#22c55e" : successRate >= 50 ? "#FFE342" : "#FF425E"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                      </svg>
                    </div>
                    <div style={{
                      fontSize: "28px",
                      fontWeight: 700,
                      color: successRate >= 80 ? "#22c55e" : successRate >= 50 ? "#FFE342" : "#FF425E",
                    }}>
                      {successRate}%
                    </div>
                    <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: "6px" }}>
                      Success Rate
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Section 3: Wallet Balances ── */}
          <div>
            <div style={SECTION_HEADER}>Wallet Balances</div>
            <div style={{ ...GLASS_CARD, padding: "24px 32px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "32px" }}>
                  {/* SOL */}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <img src={SOL_LOGO_URL} alt="SOL" width={28} height={28} style={{ borderRadius: "50%" }} />
                    <div>
                      <div style={{ fontSize: "20px", fontWeight: 700, color: "#ffffff" }}>
                        {balanceLoading ? "..." : sol.toFixed(4)}
                      </div>
                      <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>SOL</div>
                    </div>
                  </div>

                  <div style={{ width: "1px", height: "36px", backgroundColor: "rgba(255,255,255,0.1)" }} />

                  {/* USDC */}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <img src={USDC_LOGO_URL} alt="USDC" width={28} height={28} style={{ borderRadius: "50%" }} />
                    <div>
                      <div style={{ fontSize: "20px", fontWeight: 700, color: "#ffffff" }}>
                        {balanceLoading ? "..." : usdc.toFixed(2)}
                      </div>
                      <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>USDC</div>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                  <button
                    onClick={handleFaucet}
                    disabled={faucetLoading}
                    style={{
                      fontFamily: "inherit",
                      fontSize: "10px",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      padding: "8px 18px",
                      cursor: faucetLoading ? "not-allowed" : "pointer",
                      border: "1px solid #FFE342",
                      borderRadius: "6px",
                      backgroundColor: faucetLoading ? "rgba(255,227,66,0.05)" : "rgba(255,227,66,0.12)",
                      color: "#FFE342",
                      transition: "all 0.15s ease",
                      fontWeight: 600,
                    }}
                  >
                    {faucetLoading ? "Requesting..." : "Get Test USDC"}
                  </button>
                  {wallet && (
                    <a
                      href={`https://explorer.solana.com/address/${wallet}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: "10px",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        textDecoration: "none",
                        padding: "8px 18px",
                        border: "1px solid rgba(255,255,255,0.2)",
                        borderRadius: "6px",
                        color: "rgba(255,255,255,0.5)",
                        transition: "all 0.15s ease",
                      }}
                    >
                      View on Solana Explorer
                    </a>
                  )}
                  {faucetMsg && (
                    <span style={{
                      fontSize: "10px",
                      color: faucetMsg.includes("sent") ? "#FFE342" : "#FF425E",
                      fontWeight: 600,
                    }}>
                      {faucetMsg}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Section 4: Recent Activity Timeline ── */}
          <div>
            <div style={SECTION_HEADER}>Recent Activity</div>
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {[1, 2, 3].map((i) => (
                  <div key={i} style={{ ...GLASS_CARD, padding: "16px 20px", display: "flex", gap: "12px", alignItems: "center" }}>
                    <div className="shimmer" style={{ width: 10, height: 10, borderRadius: "50%", flexShrink: 0 }} />
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                      <div className="shimmer" style={{ width: "40%", height: "12px", borderRadius: "4px" }} />
                      <div className="shimmer" style={{ width: "70%", height: "10px", borderRadius: "4px" }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : activity.length === 0 ? (
              <EmptyState
                title="No Activity Yet"
                subtitle="Your transactions and events will appear here as you use the protocol."
                type="history"
              />
            ) : (
              <div style={{ position: "relative", paddingLeft: "24px" }}>
                {/* Vertical timeline line */}
                <div style={{
                  position: "absolute",
                  left: "6px",
                  top: "6px",
                  bottom: "6px",
                  width: "1px",
                  backgroundColor: "rgba(255,255,255,0.1)",
                }} />

                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {activity.map((event) => {
                    const color = EVENT_COLORS[event.type] || "rgba(255,255,255,0.4)";
                    const label = EVENT_LABELS[event.type] || event.type.replace(/_/g, " ");
                    return (
                      <div
                        key={event.id}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "14px",
                          padding: "10px 16px 10px 0",
                          position: "relative",
                        }}
                      >
                        {/* Dot */}
                        <div style={{
                          position: "absolute",
                          left: "-21px",
                          top: "14px",
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          backgroundColor: color,
                          boxShadow: `0 0 6px ${color}40`,
                          flexShrink: 0,
                        }} />

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <span style={{
                              fontSize: "9px",
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              backgroundColor: `${color}15`,
                              border: `1px solid ${color}30`,
                              color: color,
                              fontWeight: 600,
                              whiteSpace: "nowrap",
                            }}>
                              {label}
                            </span>
                            <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.25)" }}>
                              {relativeTime(event.createdAt)}
                            </span>
                            {event.txHash && (
                              <a
                                href={`https://explorer.solana.com/tx/${event.txHash}?cluster=devnet`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  fontSize: "9px",
                                  color: "#42BDFF",
                                  textDecoration: "none",
                                  fontFamily: "monospace",
                                  opacity: 0.7,
                                }}
                              >
                                {formatAddress(event.txHash)}
                              </a>
                            )}
                          </div>
                          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.55)", marginTop: "3px" }}>
                            {event.description}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ── Section 5: My Jobs (Tabbed) ── */}
          <div>
            <div style={SECTION_HEADER}>My Jobs</div>
            <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
              <button style={tabBtnStyle(tab === "posted")} onClick={() => setTab("posted")}>
                Posted ({postedJobs.length})
              </button>
              <button style={tabBtnStyle(tab === "taken")} onClick={() => setTab("taken")}>
                Taken ({takenJobs.length})
              </button>
            </div>

            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {[1, 2, 3].map((i) => <JobCardSkeleton key={i} />)}
              </div>
            ) : pagedJobs.length === 0 ? (
              <EmptyState
                title="No Jobs Yet"
                subtitle={tab === "posted" ? "Jobs you post will appear here." : "Jobs you take will appear here."}
                type="jobs"
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {pagedJobs.map((job) => {
                  const cat = getCategoryById(job.category || "text_writing");
                  const title = (job.specJson?.title as string) || `Job ${job.id.slice(0, 8)}`;
                  const completedSub = job.status === "Completed" && job.submissions
                    ? job.submissions.find((s) => s.outputText)
                    : null;
                  const hasVerifiedSub = job.submissions?.some((s) => s.verified);
                  return (
                    <div
                      key={job.id}
                      style={{
                        ...GLASS_CARD,
                        padding: "14px 20px",
                        transition: "border-color 0.15s ease",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                          <StatusBadge status={job.status as "Open" | "Accepted" | "Completed" | "Cancelled" | "Disputed"} />
                          <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)", backgroundColor: "rgba(255,255,255,0.06)", whiteSpace: "nowrap" }}>
                            {cat.tag}
                          </span>
                          <span style={{ fontSize: "12px", color: "#ffffff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {title}
                          </span>
                          {hasVerifiedSub && (
                            <span style={{
                              fontSize: "9px",
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              backgroundColor: "rgba(255,227,66,0.1)",
                              border: "1px solid rgba(255,227,66,0.3)",
                              color: "#FFE342",
                              fontWeight: 700,
                              whiteSpace: "nowrap",
                            }}>
                              ZK Verified
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                            <img src={job.paymentToken === "SOL" ? SOL_LOGO_URL : USDC_LOGO_URL} alt={job.paymentToken || "USDC"} width={14} height={14} style={{ borderRadius: "50%" }} />
                            <span style={{ fontSize: "13px", fontWeight: 600, color: "#ffffff" }}>
                              {job.amount.toFixed(2)}
                            </span>
                          </div>
                          <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)" }}>
                            {new Date(job.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                          <Link
                            href={`/job/${job.id}`}
                            style={{
                              fontSize: "9px",
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                              color: "#42BDFF",
                              textDecoration: "none",
                              padding: "3px 10px",
                              border: "1px solid rgba(66,189,255,0.3)",
                              borderRadius: "4px",
                              transition: "all 0.15s ease",
                            }}
                          >
                            View
                          </Link>
                        </div>
                      </div>
                      {/* Output preview for completed jobs */}
                      {completedSub && completedSub.outputText && (
                        <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                          <div style={{
                            fontSize: "11px",
                            color: "rgba(255,255,255,0.45)",
                            lineHeight: 1.5,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: "100%",
                          }}>
                            {completedSub.outputText.slice(0, 150)}...
                          </div>
                          <Link
                            href={`/job/${job.id}`}
                            style={{
                              fontSize: "9px",
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                              color: "#FF425E",
                              textDecoration: "none",
                              marginTop: "6px",
                              display: "inline-block",
                            }}
                          >
                            View Full Output &rarr;
                          </Link>
                        </div>
                      )}
                    </div>
                  );
                })}
                {sortedJobs.length > JOBS_PER_PAGE && (
                  <Pagination page={jobPage} totalPages={totalPages} onPageChange={setJobPage} />
                )}
              </div>
            )}
          </div>

          {/* ── Section 6: Quick Actions ── */}
          <div>
            <div style={SECTION_HEADER}>Quick Actions</div>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <Link
                href="/poster"
                style={{
                  flex: "1 1 180px",
                  textAlign: "center",
                  padding: "14px 20px",
                  border: "1px solid #42BDFF",
                  borderRadius: "8px",
                  backgroundColor: "rgba(66,189,255,0.1)",
                  color: "#42BDFF",
                  textDecoration: "none",
                  fontSize: "12px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(66,189,255,0.2)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "rgba(66,189,255,0.1)"; }}
              >
                Post a Job
              </Link>
              <Link
                href="/taker"
                style={{
                  flex: "1 1 180px",
                  textAlign: "center",
                  padding: "14px 20px",
                  border: "1px solid #FF425E",
                  borderRadius: "8px",
                  backgroundColor: "rgba(255,66,94,0.08)",
                  color: "#FF425E",
                  textDecoration: "none",
                  fontSize: "12px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,66,94,0.18)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,66,94,0.08)"; }}
              >
                Find Work
              </Link>
              <Link
                href="/agents"
                style={{
                  flex: "1 1 180px",
                  textAlign: "center",
                  padding: "14px 20px",
                  border: "1px solid #FF425E",
                  borderRadius: "8px",
                  backgroundColor: "rgba(255,66,94,0.08)",
                  color: "#FF425E",
                  textDecoration: "none",
                  fontSize: "12px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,66,94,0.18)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,66,94,0.08)"; }}
              >
                Hire an Agent
              </Link>
              <Link
                href="/verify"
                style={{
                  flex: "1 1 180px",
                  textAlign: "center",
                  padding: "14px 20px",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: "8px",
                  backgroundColor: "transparent",
                  color: "rgba(255,255,255,0.5)",
                  textDecoration: "none",
                  fontSize: "12px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
              >
                Verify Text
              </Link>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
