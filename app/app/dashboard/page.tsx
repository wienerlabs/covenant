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
import { getCategoryById, JOB_CATEGORIES } from "@/lib/categories";
import { AVAILABLE_MODELS } from "@/lib/models";
import PixelAgent from "@/components/PixelAgent";

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
  fontSize: "20px",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "rgba(255,255,255,0.5)",
  marginBottom: "20px",
  fontWeight: 700,
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
  job_created: "#fffeb2",
  create_job: "#fffeb2",
  job_accepted: "#fffeb2",
  accept_job: "#fffeb2",
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

/* ---------- Analytics Types ---------- */

interface DailyJob {
  date: string;
  count: number;
}
interface EarningEntry {
  label: string;
  amount: number;
}
interface CategoryEntry {
  category: string;
  count: number;
  percentage: number;
}
interface DashboardStats {
  dailyJobs: DailyJob[];
  earningsTrend: EarningEntry[];
  categoryDistribution: CategoryEntry[];
}

const CATEGORY_COLORS: Record<string, string> = {
  text_writing: "#a78bfa",
  code_review: "#60a5fa",
  translation: "#34d399",
  data_labeling: "#fbbf24",
  bug_bounty: "#f87171",
  design: "#f472b6",
};

const CATEGORY_LABELS: Record<string, string> = {
  text_writing: "Writing",
  code_review: "Code Review",
  translation: "Translation",
  data_labeling: "Data Labeling",
  bug_bounty: "Bug Bounty",
  design: "Design",
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ---------- Analytics Section ---------- */

function AnalyticsSection({ wallet }: { wallet: string | undefined }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [chartLoading, setChartLoading] = useState(true);

  useEffect(() => {
    if (!wallet) return;
    setChartLoading(true);
    fetch(`/api/stats/dashboard?wallet=${wallet}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setStats(data); })
      .catch(() => {})
      .finally(() => setChartLoading(false));
  }, [wallet]);

  if (!wallet) return null;

  const maxDailyCount = stats ? Math.max(...stats.dailyJobs.map((d) => d.count), 1) : 1;
  const maxEarning = stats ? Math.max(...stats.earningsTrend.map((e) => e.amount), 1) : 1;

  // Build conic-gradient for donut
  let conicGradient = "conic-gradient(rgba(255,255,255,0.1) 0deg 360deg)";
  if (stats && stats.categoryDistribution.length > 0) {
    const segments: string[] = [];
    let cumulative = 0;
    for (const cat of stats.categoryDistribution) {
      const start = cumulative;
      const end = cumulative + (cat.percentage / 100) * 360;
      const color = CATEGORY_COLORS[cat.category] || "rgba(255,255,255,0.3)";
      segments.push(`${color} ${start}deg ${end}deg`);
      cumulative = end;
    }
    conicGradient = `conic-gradient(${segments.join(", ")})`;
  }

  const chartCardStyle: React.CSSProperties = {
    ...GLASS_CARD,
    padding: "24px 20px",
    display: "flex",
    flexDirection: "column",
  };

  const chartTitleStyle: React.CSSProperties = {
    fontSize: "13px",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: "rgba(255,255,255,0.4)",
    marginBottom: "20px",
    fontWeight: 600,
  };

  const skeletonBar = (h: number, delay: number) => (
    <div
      key={delay}
      className="shimmer"
      style={{ width: "100%", height: `${h}px`, borderRadius: "4px", animationDelay: `${delay * 0.1}s` }}
    />
  );

  return (
    <div>
      <div className="font-display" style={SECTION_HEADER}>Analytics</div>
      <div
        className="analytics-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "16px",
        }}
      >
        {/* ── Chart 1: Weekly Activity (Bar Chart) ── */}
        <div style={chartCardStyle}>
          <div style={chartTitleStyle}>Weekly Activity</div>
          {chartLoading ? (
            <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", height: "120px" }}>
              {[60, 90, 40, 110, 75, 50, 85].map((h, i) => skeletonBar(h, i))}
            </div>
          ) : stats && stats.dailyJobs.length > 0 ? (
            <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", height: "120px", position: "relative" }}>
              {stats.dailyJobs.map((day, i) => {
                const pct = maxDailyCount > 0 ? (day.count / maxDailyCount) * 100 : 0;
                const barH = Math.max(pct, 4); // min 4% so empty days still show a sliver
                const dayName = DAY_NAMES[new Date(day.date + "T00:00:00").getDay()];
                return (
                  <div
                    key={day.date}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "6px",
                      height: "100%",
                      justifyContent: "flex-end",
                    }}
                  >
                    <span style={{ fontSize: "11px", fontWeight: 700, color: day.count > 0 ? "#fffeb2" : "rgba(255,255,255,0.25)" }}>
                      {day.count}
                    </span>
                    <div
                      style={{
                        width: "100%",
                        height: `${barH}%`,
                        backgroundColor: day.count > 0 ? "#fffeb2" : "rgba(255,255,255,0.08)",
                        borderRadius: "4px 4px 2px 2px",
                        transformOrigin: "bottom",
                        animation: `bar-grow 0.5s ease-out ${i * 0.07}s both`,
                      }}
                    />
                    <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {dayName}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ height: "120px", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.25)", fontSize: "13px" }}>
              No activity this week
            </div>
          )}
        </div>

        {/* ── Chart 2: Earnings Trend (Area bars) ── */}
        <div style={chartCardStyle}>
          <div style={chartTitleStyle}>Earnings Trend</div>
          {chartLoading ? (
            <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "120px" }}>
              {[50, 70, 30, 90, 60, 80, 45, 95, 55, 75].map((h, i) => skeletonBar(h, i))}
            </div>
          ) : stats && stats.earningsTrend.length > 0 ? (
            <div style={{ position: "relative" }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "120px" }}>
                {stats.earningsTrend.map((entry, i) => {
                  const pct = maxEarning > 0 ? (entry.amount / maxEarning) * 100 : 0;
                  const barH = Math.max(pct, 6);
                  return (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        height: "100%",
                        gap: "4px",
                      }}
                    >
                      <div
                        style={{
                          width: "100%",
                          height: `${barH}%`,
                          background: `linear-gradient(to top, rgba(255,254,178,0.3), #fffeb2)`,
                          borderRadius: "3px 3px 1px 1px",
                          transformOrigin: "bottom",
                          animation: `bar-grow 0.5s ease-out ${i * 0.06}s both`,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px" }}>
                <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)" }}>
                  ${stats.earningsTrend[0]?.amount.toFixed(0) ?? "0"}
                </span>
                <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)" }}>
                  ${stats.earningsTrend[stats.earningsTrend.length - 1]?.amount.toFixed(0) ?? "0"}
                </span>
              </div>
            </div>
          ) : (
            <div style={{ height: "120px", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.25)", fontSize: "13px" }}>
              No earnings yet
            </div>
          )}
        </div>

        {/* ── Chart 3: Category Distribution (Donut) ── */}
        <div style={chartCardStyle}>
          <div style={chartTitleStyle}>Category Distribution</div>
          {chartLoading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
              <div className="shimmer" style={{ width: "100px", height: "100px", borderRadius: "50%" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "100%" }}>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="shimmer" style={{ width: `${80 - i * 15}%`, height: "12px", borderRadius: "4px" }} />
                ))}
              </div>
            </div>
          ) : stats && stats.categoryDistribution.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
              {/* Donut ring */}
              <div
                style={{
                  width: "110px",
                  height: "110px",
                  borderRadius: "50%",
                  background: conicGradient,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  animation: "donut-spin 0.6s ease-out both",
                }}
              >
                <div
                  style={{
                    width: "66px",
                    height: "66px",
                    borderRadius: "50%",
                    backgroundColor: "rgba(0,0,0,0.7)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "column",
                  }}
                >
                  <span style={{ fontSize: "18px", fontWeight: 700, color: "#ffffff", lineHeight: 1 }}>
                    {stats.categoryDistribution.reduce((s, c) => s + c.count, 0)}
                  </span>
                  <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    jobs
                  </span>
                </div>
              </div>
              {/* Legend */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "100%" }}>
                {stats.categoryDistribution.map((cat) => {
                  const color = CATEGORY_COLORS[cat.category] || "rgba(255,255,255,0.4)";
                  const label = CATEGORY_LABELS[cat.category] || cat.category.replace(/_/g, " ");
                  return (
                    <div
                      key={cat.category}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ width: "8px", height: "8px", borderRadius: "2px", backgroundColor: color, flexShrink: 0 }} />
                        <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)", textTransform: "capitalize" }}>
                          {label}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "12px", fontWeight: 600, color: "#ffffff" }}>{cat.count}</span>
                        <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>{cat.percentage}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ height: "120px", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.25)", fontSize: "13px" }}>
              No category data
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Component ---------- */

export default function DashboardPage() {
  const { isConnected, account } = useConnector();
  const wallet = isConnected && account ? account : undefined;
  const { profile, loading: profileLoading } = useProfile(wallet);
  const { reputation } = useReputation(wallet);
  const { sol, usdc, loading: balanceLoading, refetch: refetchBalance } = useWalletBalance(wallet);

  const [tab, setTab] = useState<"posted" | "taken" | "agents">("posted");
  const [postedJobs, setPostedJobs] = useState<JobData[]>([]);
  const [takenJobs, setTakenJobs] = useState<JobData[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [faucetMsg, setFaucetMsg] = useState<string | null>(null);
  const [jobPage, setJobPage] = useState(1);
  const JOBS_PER_PAGE = 10;

  /* -- My Agents state -- */
  const [myAgents, setMyAgents] = useState<any[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [editingAgent, setEditingAgent] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [savingAgent, setSavingAgent] = useState(false);

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

  // Fetch my agents when tab switches to "agents"
  useEffect(() => {
    if (tab === "agents" && wallet) {
      setAgentsLoading(true);
      fetch("/api/hosted-agents")
        .then((r) => r.json())
        .then((all) => {
          setMyAgents(
            (Array.isArray(all) ? all : []).filter(
              (a: any) => a.walletAddress === wallet
            )
          );
        })
        .catch(() => setMyAgents([]))
        .finally(() => setAgentsLoading(false));
    }
  }, [tab, wallet]);

  function startEditing(agent: any) {
    setEditingAgent(agent.id);
    setEditForm({
      name: agent.name || "",
      systemPrompt: agent.systemPrompt || "",
      model: agent.model || "",
      category: agent.category || "",
      minPrice: agent.minPrice ?? 0,
      maxPrice: agent.maxPrice ?? 0,
      pricePerPrompt: agent.pricePerPrompt ?? 0,
      webEnabled: agent.webEnabled ?? false,
      avatarUrl: agent.avatarUrl || "",
      avatarPreview: "",
    });
  }

  async function handleSaveAgent(agentId: string) {
    if (!wallet) return;
    setSavingAgent(true);
    try {
      const updates: any = { ...editForm, walletAddress: wallet };
      // avatarPreview is only for UI, don't send it
      delete updates.avatarPreview;
      const res = await fetch(`/api/hosted-agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const updated = await res.json();
        setMyAgents((prev) =>
          prev.map((a) => (a.id === agentId ? updated : a))
        );
        setEditingAgent(null);
      }
    } catch {
      // silent
    } finally {
      setSavingAgent(false);
    }
  }

  async function handleToggleActive(agent: any) {
    if (!wallet) return;
    const newActive = !agent.active;
    try {
      const res = await fetch(`/api/hosted-agents/${agent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: wallet, active: newActive }),
      });
      if (res.ok) {
        const updated = await res.json();
        setMyAgents((prev) =>
          prev.map((a) => (a.id === agent.id ? updated : a))
        );
      }
    } catch {
      // silent
    }
  }

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
    fontSize: "14px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    padding: "10px 28px",
    cursor: "pointer",
    border: active ? "1px solid #fffeb2" : "1px solid rgba(255,255,255,0.2)",
    borderRadius: "6px",
    backgroundColor: active ? "rgba(255,254,178,0.12)" : "transparent",
    color: active ? "#fffeb2" : "rgba(255,255,255,0.5)",
    backdropFilter: "blur(4px)",
    transition: "all 0.15s ease",
    fontWeight: active ? 600 : 400,
  });

  /* ---------- Not connected ---------- */
  if (!isConnected) {
    return (
      <div style={{ minHeight: "100vh", fontFamily: "inherit", position: "relative" }}>
        <div style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "image-set(url('/poster-bg.webp') type('image/webp'), url('/poster-bg.png') type('image/png'))", backgroundSize: "cover", backgroundPosition: "center" }} />
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
      <div style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "image-set(url('/poster-bg.webp') type('image/webp'), url('/poster-bg.png') type('image/png'))", backgroundSize: "cover", backgroundPosition: "center" }} />
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
                <div style={{ fontSize: "16px", fontWeight: 400, color: "rgba(255,255,255,0.5)", marginBottom: "2px" }}>
                  Welcome back,
                </div>
                <div className="font-display" style={{ fontSize: "36px", fontWeight: 700, color: "#ffffff", marginBottom: "6px" }}>
                  {profileLoading ? "Loading..." : profile ? profile.displayName : "Dashboard"}
                </div>
                {wallet && (
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", fontFamily: "monospace" }}>
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
                  fontSize: "13px",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  textDecoration: "none",
                  padding: "10px 22px",
                  border: "1px solid rgba(255,255,255,0.25)",
                  borderRadius: "6px",
                  color: "rgba(255,255,255,0.7)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  transition: "all 0.15s ease",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#fffeb2"; e.currentTarget.style.color = "#fffeb2"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
              >
                Edit Profile
              </Link>
            </div>
          </div>

          {/* ── Section 2: Stats Grid ── */}
          <div>
            <div className="font-display" style={SECTION_HEADER}>Overview</div>
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
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fffeb2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="12" y1="18" x2="12" y2="12" />
                        <line x1="9" y1="15" x2="15" y2="15" />
                      </svg>
                    </div>
                    <div style={{ fontSize: "28px", fontWeight: 700, color: "#ffffff" }}>{jobsPostedCount}</div>
                    <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: "6px" }}>
                      Jobs Posted
                    </div>
                    <Link href="/poster" style={{ fontSize: "12px", color: "#fffeb2", textDecoration: "none", marginTop: "8px", display: "inline-block", letterSpacing: "0.05em" }}>
                      View all &rarr;
                    </Link>
                  </div>

                  {/* Jobs Taken */}
                  <div style={{ ...GLASS_CARD, padding: "24px 20px", textAlign: "center" }}>
                    <div style={{ marginBottom: "10px" }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fffeb2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                      </svg>
                    </div>
                    <div style={{ fontSize: "28px", fontWeight: 700, color: "#ffffff" }}>{jobsTakenCount}</div>
                    <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: "6px" }}>
                      Jobs Taken
                    </div>
                    <Link href="/taker" style={{ fontSize: "12px", color: "#fffeb2", textDecoration: "none", marginTop: "8px", display: "inline-block", letterSpacing: "0.05em" }}>
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
                    <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: "6px" }}>
                      Total Earned
                    </div>
                  </div>

                  {/* Success Rate */}
                  <div style={{ ...GLASS_CARD, padding: "24px 20px", textAlign: "center" }}>
                    <div style={{ marginBottom: "10px" }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={successRate >= 80 ? "#22c55e" : successRate >= 50 ? "#fffeb2" : "#FF425E"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                      </svg>
                    </div>
                    <div style={{
                      fontSize: "28px",
                      fontWeight: 700,
                      color: successRate >= 80 ? "#22c55e" : successRate >= 50 ? "#fffeb2" : "#FF425E",
                    }}>
                      {successRate}%
                    </div>
                    <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: "6px" }}>
                      Success Rate
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Section 2b: Analytics Charts ── */}
          <AnalyticsSection wallet={wallet} />

          {/* ── Section 3: Wallet Balances ── */}
          <div>
            <div className="font-display" style={SECTION_HEADER}>Wallet Balances</div>
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
                      <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>SOL</div>
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
                      <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>USDC</div>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                  <button
                    onClick={handleFaucet}
                    disabled={faucetLoading}
                    style={{
                      fontFamily: "inherit",
                      fontSize: "12px",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      padding: "10px 20px",
                      cursor: faucetLoading ? "not-allowed" : "pointer",
                      border: "1px solid #fffeb2",
                      borderRadius: "6px",
                      backgroundColor: faucetLoading ? "rgba(255,227,66,0.05)" : "rgba(255,227,66,0.12)",
                      color: "#fffeb2",
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
                        fontSize: "12px",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        textDecoration: "none",
                        padding: "10px 20px",
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
                      fontSize: "13px",
                      color: faucetMsg.includes("sent") ? "#fffeb2" : "#FF425E",
                      fontWeight: 600,
                    }}>
                      {faucetMsg}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Section 4: My Jobs (Tabbed) ── */}
          <div>
            <div className="font-display" style={SECTION_HEADER}>My Jobs</div>
            <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
              <button style={tabBtnStyle(tab === "posted")} onClick={() => setTab("posted")}>
                Posted ({postedJobs.length})
              </button>
              <button style={tabBtnStyle(tab === "taken")} onClick={() => setTab("taken")}>
                Taken ({takenJobs.length})
              </button>
              <button style={tabBtnStyle(tab === "agents")} onClick={() => setTab("agents")}>
                My Agents ({myAgents.length})
              </button>
            </div>

            {/* ── Job cards (posted / taken tabs) ── */}
            {tab !== "agents" && (
              <>
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
                              <span style={{ fontSize: "12px", padding: "3px 10px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)", backgroundColor: "rgba(255,255,255,0.06)", whiteSpace: "nowrap" }}>
                                {cat.tag}
                              </span>
                              <span style={{ fontSize: "14px", fontWeight: 500, color: "#ffffff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {title}
                              </span>
                              {hasVerifiedSub && (
                                <span style={{
                                  fontSize: "11px",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.04em",
                                  padding: "3px 10px",
                                  borderRadius: "4px",
                                  backgroundColor: "rgba(255,227,66,0.1)",
                                  border: "1px solid rgba(255,227,66,0.3)",
                                  color: "#fffeb2",
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
                              <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)" }}>
                                {new Date(job.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              </span>
                              <Link
                                href={`/job/${job.id}`}
                                style={{
                                  fontSize: "12px",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.05em",
                                  color: "#fffeb2",
                                  textDecoration: "none",
                                  padding: "5px 14px",
                                  border: "1px solid rgba(255,254,178,0.3)",
                                  borderRadius: "4px",
                                  transition: "all 0.15s ease",
                                }}
                              >
                                View
                              </Link>
                            </div>
                          </div>
                          {completedSub && completedSub.outputText && (
                            <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                              <div style={{
                                fontSize: "13px",
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
                                  fontSize: "12px",
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
              </>
            )}

            {/* ── Agent cards (agents tab) ── */}
            {tab === "agents" && (
              <>
                {agentsLoading ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {[1, 2, 3].map((i) => <JobCardSkeleton key={i} />)}
                  </div>
                ) : myAgents.length === 0 ? (
                  <EmptyState
                    title="No Agents Yet"
                    subtitle="Agents you create will appear here. Build one from the Agent Builder."
                    type="jobs"
                  />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {myAgents.map((agent) => {
                      const catInfo = getCategoryById(agent.category || "text_writing");
                      const modelInfo = AVAILABLE_MODELS.find((m) => m.id === agent.model);
                      const isEditing = editingAgent === agent.id;

                      return (
                        <div
                          key={agent.id}
                          style={{
                            ...GLASS_CARD,
                            padding: "20px 24px",
                            transition: "border-color 0.15s ease",
                            opacity: agent.active ? 1 : 0.6,
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
                        >
                          {/* ── Agent card header ── */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "16px", minWidth: 0 }}>
                              {/* Avatar */}
                              <div style={{ flexShrink: 0 }}>
                                {agent.avatarUrl ? (
                                  <img
                                    src={agent.avatarUrl}
                                    alt={agent.name}
                                    width={48}
                                    height={48}
                                    style={{ borderRadius: "8px", objectFit: "cover" }}
                                  />
                                ) : (
                                  <PixelAgent
                                    seed={agent.avatarSeed || agent.id}
                                    color="#fffeb2"
                                    size={48}
                                  />
                                )}
                              </div>

                              <div style={{ minWidth: 0 }}>
                                <div className="font-display" style={{ fontSize: "18px", fontWeight: 700, color: "#ffffff", marginBottom: "4px" }}>
                                  {agent.name}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                                  <span style={{
                                    fontSize: "11px",
                                    padding: "2px 8px",
                                    borderRadius: "4px",
                                    border: "1px solid rgba(255,255,255,0.15)",
                                    color: "rgba(255,255,255,0.7)",
                                    backgroundColor: "rgba(255,255,255,0.06)",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.05em",
                                  }}>
                                    {catInfo.tag}
                                  </span>
                                  <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>
                                    {modelInfo?.name || agent.model}
                                  </span>
                                  {agent.webEnabled && (
                                    <span style={{
                                      fontSize: "10px",
                                      padding: "2px 6px",
                                      borderRadius: "3px",
                                      backgroundColor: "rgba(34,197,94,0.15)",
                                      border: "1px solid rgba(34,197,94,0.3)",
                                      color: "#22c55e",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.04em",
                                    }}>
                                      Web
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                              {/* Stats */}
                              <div style={{ display: "flex", alignItems: "center", gap: "16px", marginRight: "8px" }}>
                                <div style={{ textAlign: "center" }}>
                                  <div style={{ fontSize: "16px", fontWeight: 700, color: "#ffffff" }}>{agent.jobsCompleted ?? 0}</div>
                                  <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Jobs</div>
                                </div>
                                <div style={{ textAlign: "center" }}>
                                  <div style={{ fontSize: "16px", fontWeight: 700, color: "#ffffff" }}>${(agent.totalEarned ?? 0).toFixed(2)}</div>
                                  <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Earned</div>
                                </div>
                                <div style={{ textAlign: "center" }}>
                                  <div style={{ fontSize: "16px", fontWeight: 700, color: "#fffeb2" }}>${agent.pricePerPrompt ?? 0}/prompt</div>
                                  <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Price</div>
                                </div>
                              </div>

                              {/* Active toggle */}
                              <button
                                onClick={() => handleToggleActive(agent)}
                                style={{
                                  fontFamily: "inherit",
                                  fontSize: "11px",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.06em",
                                  padding: "6px 14px",
                                  cursor: "pointer",
                                  border: agent.active ? "1px solid #22c55e" : "1px solid rgba(255,255,255,0.2)",
                                  borderRadius: "4px",
                                  backgroundColor: agent.active ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.06)",
                                  color: agent.active ? "#22c55e" : "rgba(255,255,255,0.4)",
                                  transition: "all 0.15s ease",
                                  fontWeight: 600,
                                }}
                              >
                                {agent.active ? "Active" : "Inactive"}
                              </button>

                              {/* Edit button */}
                              <button
                                onClick={() => isEditing ? setEditingAgent(null) : startEditing(agent)}
                                style={{
                                  fontFamily: "inherit",
                                  fontSize: "11px",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.06em",
                                  padding: "6px 14px",
                                  cursor: "pointer",
                                  border: isEditing ? "1px solid #fffeb2" : "1px solid rgba(255,255,255,0.2)",
                                  borderRadius: "4px",
                                  backgroundColor: isEditing ? "rgba(255,254,178,0.12)" : "transparent",
                                  color: isEditing ? "#fffeb2" : "rgba(255,255,255,0.5)",
                                  transition: "all 0.15s ease",
                                  fontWeight: 600,
                                }}
                              >
                                {isEditing ? "Cancel" : "Edit"}
                              </button>
                            </div>
                          </div>

                          {/* ── Inline Edit Form ── */}
                          {isEditing && (
                            <div style={{
                              marginTop: "16px",
                              paddingTop: "16px",
                              borderTop: "1px solid rgba(255,255,255,0.08)",
                              display: "flex",
                              flexDirection: "column",
                              gap: "14px",
                            }}>
                              {/* Avatar upload */}
                              <div style={{ marginBottom: "16px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                                  <div style={{ width: "64px", height: "64px", borderRadius: "12px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.12)", flexShrink: 0 }}>
                                    {editForm.avatarPreview || agent.avatarUrl ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={editForm.avatarPreview || agent.avatarUrl} alt="" style={{ width: "64px", height: "64px", objectFit: "cover" }} />
                                    ) : (
                                      <PixelAgent seed={agent.avatarSeed || agent.id} color="#fffeb2" size={64} state="idle" />
                                    )}
                                  </div>
                                  <label style={{
                                    fontFamily: "inherit", fontSize: "12px", fontWeight: 600,
                                    padding: "8px 16px", borderRadius: "6px",
                                    border: "1px solid rgba(255,254,178,0.3)", backgroundColor: "rgba(255,254,178,0.08)",
                                    color: "#fffeb2", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em",
                                  }}>
                                    Change Avatar
                                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (!file || file.size > 2 * 1024 * 1024) return;
                                      const reader = new FileReader();
                                      reader.onload = () => {
                                        const dataUrl = reader.result as string;
                                        setEditForm((prev: Record<string, any>) => ({ ...prev, avatarPreview: dataUrl, avatarUrl: dataUrl }));
                                      };
                                      reader.readAsDataURL(file);
                                    }} />
                                  </label>
                                </div>
                              </div>
                              {/* Row 1: Name + Category + Model */}
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                                <div>
                                  <label style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)", marginBottom: "6px", display: "block" }}>
                                    Name
                                  </label>
                                  <input
                                    type="text"
                                    value={editForm.name || ""}
                                    onChange={(e) => setEditForm((f: Record<string, any>) => ({ ...f, name: e.target.value }))}
                                    style={{
                                      width: "100%",
                                      fontFamily: "inherit",
                                      fontSize: "13px",
                                      padding: "8px 12px",
                                      border: "1px solid rgba(255,255,255,0.15)",
                                      borderRadius: "6px",
                                      backgroundColor: "rgba(0,0,0,0.3)",
                                      color: "#ffffff",
                                      outline: "none",
                                      boxSizing: "border-box",
                                    }}
                                  />
                                </div>
                                <div>
                                  <label style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)", marginBottom: "6px", display: "block" }}>
                                    Category
                                  </label>
                                  <select
                                    value={editForm.category || ""}
                                    onChange={(e) => setEditForm((f: Record<string, any>) => ({ ...f, category: e.target.value }))}
                                    style={{
                                      width: "100%",
                                      fontFamily: "inherit",
                                      fontSize: "13px",
                                      padding: "8px 12px",
                                      border: "1px solid rgba(255,255,255,0.15)",
                                      borderRadius: "6px",
                                      backgroundColor: "rgba(0,0,0,0.3)",
                                      color: "#ffffff",
                                      outline: "none",
                                      boxSizing: "border-box",
                                    }}
                                  >
                                    {JOB_CATEGORIES.map((c) => (
                                      <option key={c.id} value={c.id}>{c.label}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)", marginBottom: "6px", display: "block" }}>
                                    Model
                                  </label>
                                  <select
                                    value={editForm.model || ""}
                                    onChange={(e) => setEditForm((f: Record<string, any>) => ({ ...f, model: e.target.value }))}
                                    style={{
                                      width: "100%",
                                      fontFamily: "inherit",
                                      fontSize: "13px",
                                      padding: "8px 12px",
                                      border: "1px solid rgba(255,255,255,0.15)",
                                      borderRadius: "6px",
                                      backgroundColor: "rgba(0,0,0,0.3)",
                                      color: "#ffffff",
                                      outline: "none",
                                      boxSizing: "border-box",
                                    }}
                                  >
                                    {AVAILABLE_MODELS.map((m) => (
                                      <option key={m.id} value={m.id} disabled={!m.available}>
                                        {m.name} ({m.cost})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              {/* Row 2: System Prompt */}
                              <div>
                                <label style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)", marginBottom: "6px", display: "block" }}>
                                  System Prompt
                                </label>
                                <textarea
                                  value={editForm.systemPrompt || ""}
                                  onChange={(e) => setEditForm((f: Record<string, any>) => ({ ...f, systemPrompt: e.target.value }))}
                                  rows={4}
                                  style={{
                                    width: "100%",
                                    fontFamily: "inherit",
                                    fontSize: "13px",
                                    padding: "10px 12px",
                                    border: "1px solid rgba(255,255,255,0.15)",
                                    borderRadius: "6px",
                                    backgroundColor: "rgba(0,0,0,0.3)",
                                    color: "#ffffff",
                                    outline: "none",
                                    resize: "vertical",
                                    lineHeight: 1.5,
                                    boxSizing: "border-box",
                                  }}
                                />
                              </div>

                              {/* Row 3: Price fields + Web toggle */}
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px", alignItems: "end" }}>
                                <div>
                                  <label style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)", marginBottom: "6px", display: "block" }}>
                                    Min Price ($)
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={editForm.minPrice ?? 0}
                                    onChange={(e) => setEditForm((f: Record<string, any>) => ({ ...f, minPrice: parseFloat(e.target.value) || 0 }))}
                                    style={{
                                      width: "100%",
                                      fontFamily: "inherit",
                                      fontSize: "13px",
                                      padding: "8px 12px",
                                      border: "1px solid rgba(255,255,255,0.15)",
                                      borderRadius: "6px",
                                      backgroundColor: "rgba(0,0,0,0.3)",
                                      color: "#ffffff",
                                      outline: "none",
                                      boxSizing: "border-box",
                                    }}
                                  />
                                </div>
                                <div>
                                  <label style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)", marginBottom: "6px", display: "block" }}>
                                    Max Price ($)
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={editForm.maxPrice ?? 0}
                                    onChange={(e) => setEditForm((f: Record<string, any>) => ({ ...f, maxPrice: parseFloat(e.target.value) || 0 }))}
                                    style={{
                                      width: "100%",
                                      fontFamily: "inherit",
                                      fontSize: "13px",
                                      padding: "8px 12px",
                                      border: "1px solid rgba(255,255,255,0.15)",
                                      borderRadius: "6px",
                                      backgroundColor: "rgba(0,0,0,0.3)",
                                      color: "#ffffff",
                                      outline: "none",
                                      boxSizing: "border-box",
                                    }}
                                  />
                                </div>
                                <div>
                                  <label style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)", marginBottom: "6px", display: "block" }}>
                                    Price / Prompt ($)
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.001"
                                    value={editForm.pricePerPrompt ?? 0}
                                    onChange={(e) => setEditForm((f: Record<string, any>) => ({ ...f, pricePerPrompt: parseFloat(e.target.value) || 0 }))}
                                    style={{
                                      width: "100%",
                                      fontFamily: "inherit",
                                      fontSize: "13px",
                                      padding: "8px 12px",
                                      border: "1px solid rgba(255,255,255,0.15)",
                                      borderRadius: "6px",
                                      backgroundColor: "rgba(0,0,0,0.3)",
                                      color: "#ffffff",
                                      outline: "none",
                                      boxSizing: "border-box",
                                    }}
                                  />
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingBottom: "2px" }}>
                                  <label style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)" }}>
                                    Web Search
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => setEditForm((f: Record<string, any>) => ({ ...f, webEnabled: !f.webEnabled }))}
                                    style={{
                                      width: "40px",
                                      height: "22px",
                                      borderRadius: "11px",
                                      border: "none",
                                      cursor: "pointer",
                                      backgroundColor: editForm.webEnabled ? "#fffeb2" : "rgba(255,255,255,0.15)",
                                      position: "relative",
                                      transition: "background-color 0.2s ease",
                                    }}
                                  >
                                    <div style={{
                                      width: "16px",
                                      height: "16px",
                                      borderRadius: "50%",
                                      backgroundColor: editForm.webEnabled ? "#000000" : "rgba(255,255,255,0.4)",
                                      position: "absolute",
                                      top: "3px",
                                      left: editForm.webEnabled ? "21px" : "3px",
                                      transition: "left 0.2s ease, background-color 0.2s ease",
                                    }} />
                                  </button>
                                </div>
                              </div>

                              {/* Row 4: Save button */}
                              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "4px" }}>
                                <button
                                  onClick={() => setEditingAgent(null)}
                                  style={{
                                    fontFamily: "inherit",
                                    fontSize: "12px",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.06em",
                                    padding: "8px 20px",
                                    cursor: "pointer",
                                    border: "1px solid rgba(255,255,255,0.2)",
                                    borderRadius: "6px",
                                    backgroundColor: "transparent",
                                    color: "rgba(255,255,255,0.5)",
                                    transition: "all 0.15s ease",
                                    fontWeight: 600,
                                  }}
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => handleSaveAgent(agent.id)}
                                  disabled={savingAgent}
                                  style={{
                                    fontFamily: "inherit",
                                    fontSize: "12px",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.06em",
                                    padding: "8px 24px",
                                    cursor: savingAgent ? "not-allowed" : "pointer",
                                    border: "1px solid #fffeb2",
                                    borderRadius: "6px",
                                    backgroundColor: "rgba(255,254,178,0.12)",
                                    color: "#fffeb2",
                                    transition: "all 0.15s ease",
                                    fontWeight: 600,
                                  }}
                                >
                                  {savingAgent ? "Saving..." : "Save Changes"}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Section 5: Recent Activity Timeline ── */}
          <div>
            <div className="font-display" style={SECTION_HEADER}>Recent Activity</div>
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
                              fontSize: "12px",
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                              padding: "3px 10px",
                              borderRadius: "4px",
                              backgroundColor: `${color}15`,
                              border: `1px solid ${color}30`,
                              color: color,
                              fontWeight: 600,
                              whiteSpace: "nowrap",
                            }}>
                              {label}
                            </span>
                            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.25)" }}>
                              {relativeTime(event.createdAt)}
                            </span>
                            {event.txHash && (
                              <a
                                href={`https://explorer.solana.com/tx/${event.txHash}?cluster=devnet`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  fontSize: "12px",
                                  color: "#fffeb2",
                                  textDecoration: "none",
                                  fontFamily: "monospace",
                                  opacity: 0.7,
                                }}
                              >
                                {formatAddress(event.txHash)}
                              </a>
                            )}
                          </div>
                          <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.55)", marginTop: "4px" }}>
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

          {/* ── Section 6: Quick Actions ── */}
          <div>
            <div className="font-display" style={SECTION_HEADER}>Quick Actions</div>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <Link
                href="/poster"
                style={{
                  flex: "1 1 180px",
                  textAlign: "center",
                  padding: "14px 20px",
                  border: "1px solid #fffeb2",
                  borderRadius: "8px",
                  backgroundColor: "rgba(255,254,178,0.1)",
                  color: "#fffeb2",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,254,178,0.2)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,254,178,0.1)"; }}
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
                  fontSize: "14px",
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
                  fontSize: "14px",
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
                href="/taker"
                style={{
                  flex: "1 1 180px",
                  textAlign: "center",
                  padding: "14px 20px",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: "8px",
                  backgroundColor: "transparent",
                  color: "rgba(255,255,255,0.5)",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
              >
                Find Work
              </Link>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
