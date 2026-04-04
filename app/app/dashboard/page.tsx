"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useConnector } from "@solana/connector/react";
import NavBar from "@/components/NavBar";
import PixelAvatar from "@/components/PixelAvatar";
import StatusBadge from "@/components/StatusBadge";
import { StatCardSkeleton, JobCardSkeleton } from "@/components/LoadingSkeleton";
import useProfile from "@/hooks/useProfile";
import useReputation from "@/hooks/useReputation";
import CopyButton from "@/components/CopyButton";
import EmptyState from "@/components/EmptyState";
import { formatAddress } from "@/lib/format";
import { USDC_LOGO_URL, SOL_LOGO_URL } from "@/lib/constants";
import { getCategoryById } from "@/lib/categories";

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
}

interface TxData {
  id: string;
  txHash: string;
  type: string;
  amount: number;
  wallet: string;
  createdAt: string;
}

export default function DashboardPage() {
  const { isConnected, account } = useConnector();
  const wallet = isConnected && account ? account : undefined;
  const { profile, loading: profileLoading } = useProfile(wallet);
  const { reputation } = useReputation(wallet);

  const [tab, setTab] = useState<"posted" | "taken">("posted");
  const [postedJobs, setPostedJobs] = useState<JobData[]>([]);
  const [takenJobs, setTakenJobs] = useState<JobData[]>([]);
  const [transactions, setTransactions] = useState<TxData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    try {
      const [posterRes, takerRes, txRes] = await Promise.all([
        fetch(`/api/jobs?poster=${wallet}`),
        fetch(`/api/jobs?taker=${wallet}`),
        fetch(`/api/transactions?wallet=${wallet}`),
      ]);

      if (posterRes.ok) {
        const posterData = await posterRes.json();
        setPostedJobs(Array.isArray(posterData) ? posterData : (posterData.jobs || []));
      }
      if (takerRes.ok) {
        const takerData = await takerRes.json();
        setTakenJobs(Array.isArray(takerData) ? takerData : (takerData.jobs || []));
      }
      if (txRes.ok) {
        const txData = await txRes.json();
        setTransactions(Array.isArray(txData) ? txData.slice(0, 20) : []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalJobs = postedJobs.length + takenJobs.length;
  const totalEarned = reputation.totalEarned;
  const totalSpent = postedJobs.reduce((sum, j) => sum + j.amount, 0);
  const completedCount = reputation.jobsCompleted;
  const failedCount = reputation.jobsFailed;
  const successRate = completedCount + failedCount > 0
    ? Math.round((completedCount / (completedCount + failedCount)) * 100)
    : 100;

  const jobs = tab === "posted" ? postedJobs : takenJobs;

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: "inherit",
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    padding: "8px 20px",
    cursor: "pointer",
    border: "1px solid rgba(255,255,255,0.25)",
    borderRadius: "6px",
    backgroundColor: active ? "rgba(255,255,255,0.15)" : "transparent",
    color: active ? "#ffffff" : "rgba(255,255,255,0.5)",
    backdropFilter: "blur(4px)",
    transition: "all 0.15s ease",
  });

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

  return (
    <div style={{ minHeight: "100vh", fontFamily: "inherit", position: "relative" }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "url('/poster-bg.png')", backgroundSize: "cover", backgroundPosition: "center" }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)" }} />

      <div style={{ position: "relative", zIndex: 2 }}>
        <NavBar activeTab="dashboard" variant="dark" />

        <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "32px 24px" }}>
          {/* Welcome header */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "32px" }}>
            {profile && <PixelAvatar seed={profile.avatarSeed} size={56} />}
            <div>
              <div style={{ fontSize: "24px", fontWeight: 700, color: "#ffffff" }}>
                {profileLoading ? "Loading..." : profile ? `Welcome, ${profile.displayName}` : "Dashboard"}
              </div>
              {wallet && (
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>
                  {formatAddress(wallet)}
                </div>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div
            className="dashboard-stats"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "16px",
              marginBottom: "32px",
            }}
          >
            {[
              { label: "Total Jobs", value: String(totalJobs) },
              { label: "Total Earned", value: `$${totalEarned.toFixed(2)}`, isUSDC: true },
              { label: "Total Spent", value: `$${totalSpent.toFixed(2)}`, isUSDC: true },
              { label: "Success Rate", value: `${successRate}%` },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "12px",
                  padding: "20px",
                  backgroundColor: "rgba(0,0,0,0.3)",
                  backdropFilter: "blur(12px)",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "24px", fontWeight: 700, color: "#ffffff", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  {stat.isUSDC && <img src={USDC_LOGO_URL} alt="USDC" width={18} height={18} style={{ borderRadius: "50%" }} />}
                  {stat.value}
                </div>
                <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: "6px" }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
            <button style={tabBtnStyle(tab === "posted")} onClick={() => setTab("posted")}>
              Jobs Posted ({postedJobs.length})
            </button>
            <button style={tabBtnStyle(tab === "taken")} onClick={() => setTab("taken")}>
              Jobs Taken ({takenJobs.length})
            </button>
          </div>

          {/* Job list */}
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {[1, 2, 3].map((i) => <JobCardSkeleton key={i} />)}
            </div>
          ) : jobs.length === 0 ? (
            <EmptyState
              title="No Jobs Yet"
              subtitle="Jobs you post or take will appear here."
              type="jobs"
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {jobs.map((job) => {
                const cat = getCategoryById(job.category || "text_writing");
                return (
                  <Link key={job.id} href={`/job/${job.id}`} style={{ textDecoration: "none" }}>
                    <div
                      style={{
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: "10px",
                        padding: "16px 20px",
                        backgroundColor: "rgba(0,0,0,0.25)",
                        backdropFilter: "blur(12px)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        transition: "border-color 0.15s ease",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <StatusBadge status={job.status as "Open" | "Accepted" | "Completed" | "Cancelled" | "Disputed"} />
                        <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)", backgroundColor: "rgba(255,255,255,0.06)" }}>
                          {cat.tag}
                        </span>
                        <span style={{ fontSize: "12px", color: "#ffffff" }}>
                          {(job.specJson?.title as string) || `Job ${job.id.slice(0, 8)}`}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <img src={job.paymentToken === "SOL" ? SOL_LOGO_URL : USDC_LOGO_URL} alt={job.paymentToken || "USDC"} width={16} height={16} style={{ borderRadius: "50%" }} />
                        <span style={{ fontSize: "14px", fontWeight: 600, color: "#ffffff" }}>
                          {job.amount.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Recent transactions */}
          <div style={{ marginTop: "40px" }}>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "#ffffff", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "16px" }}>
              Recent Transactions
            </div>
            {transactions.length === 0 ? (
              <EmptyState
                title="No Transactions"
                subtitle="Your wallet transactions will appear here once you start using the protocol."
                type="transactions"
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {transactions.map((tx) => {
                  const typeColors: Record<string, string> = {
                    create_job: "#3b82f6",
                    accept_job: "#f59e0b",
                    submit_completion: "#10b981",
                    escrow_lock: "#8b5cf6",
                    escrow_release: "#06b6d4",
                    payment_released: "#22c55e",
                    x402_payment: "#ec4899",
                  };
                  const badgeColor = typeColors[tx.type] || "rgba(255,255,255,0.5)";

                  return (
                    <div
                      key={tx.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px 16px",
                        borderRadius: "8px",
                        border: "1px solid rgba(255,255,255,0.08)",
                        backgroundColor: "rgba(0,0,0,0.2)",
                        backdropFilter: "blur(8px)",
                        fontSize: "11px",
                        flexWrap: "wrap",
                        gap: "8px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span
                          style={{
                            fontSize: "9px",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            padding: "2px 8px",
                            borderRadius: "4px",
                            backgroundColor: `${badgeColor}20`,
                            border: `1px solid ${badgeColor}40`,
                            color: badgeColor,
                            fontWeight: 600,
                          }}
                        >
                          {tx.type.replace(/_/g, " ")}
                        </span>
                        {tx.amount > 0 && (
                          <span style={{ color: "#86efac", fontWeight: 600 }}>${tx.amount.toFixed(2)}</span>
                        )}
                        <span style={{ color: "rgba(255,255,255,0.25)", fontSize: "9px" }}>
                          {new Date(tx.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <a
                          href={`https://explorer.solana.com/tx/${tx.txHash}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "#5ba4f5", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px" }}
                        >
                          <img src={SOL_LOGO_URL} alt="SOL" width={10} height={10} style={{ borderRadius: "50%" }} />
                          {formatAddress(tx.txHash)}
                        </a>
                        <CopyButton text={tx.txHash} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
