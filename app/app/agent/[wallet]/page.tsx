"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import PixelAvatar from "@/components/PixelAvatar";
import StatusBadge from "@/components/StatusBadge";
import { ProfileSkeleton, StatCardSkeleton, JobCardSkeleton } from "@/components/LoadingSkeleton";
import { formatAddress } from "@/lib/format";
import { USDC_LOGO_URL, SOL_LOGO_URL } from "@/lib/constants";
import { getCategoryById } from "@/lib/categories";
import DIDBadge from "@/components/DIDBadge";

interface ProfileData {
  displayName: string;
  bio: string;
  role: string;
  avatarSeed: string;
  walletAddress: string;
}

interface ReputationData {
  jobsCompleted: number;
  jobsFailed: number;
  totalEarned: number;
}

interface JobData {
  id: string;
  posterWallet: string;
  takerWallet: string | null;
  amount: number;
  paymentToken: string;
  status: string;
  category: string;
  specJson: Record<string, unknown>;
  createdAt: string;
}

export default function AgentProfilePage({ params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = use(params);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [reputation, setReputation] = useState<ReputationData>({ jobsCompleted: 0, jobsFailed: 0, totalEarned: 0 });
  const [jobs, setJobs] = useState<JobData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [profileRes, repRes, jobsRes] = await Promise.all([
          fetch(`/api/profile/${wallet}`),
          fetch(`/api/reputation/${wallet}`),
          fetch(`/api/jobs?taker=${wallet}`),
        ]);

        if (profileRes.ok) setProfile(await profileRes.json());
        if (repRes.ok) {
          const data = await repRes.json();
          setReputation({
            jobsCompleted: data.jobsCompleted ?? 0,
            jobsFailed: data.jobsFailed ?? 0,
            totalEarned: data.totalEarned ?? 0,
          });
        }
        if (jobsRes.ok) {
          const data = await jobsRes.json();
          const jobsArr = Array.isArray(data) ? data : (data.jobs || []);
          setJobs(jobsArr.slice(0, 10));
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [wallet]);

  const successRate = reputation.jobsCompleted + reputation.jobsFailed > 0
    ? Math.round((reputation.jobsCompleted / (reputation.jobsCompleted + reputation.jobsFailed)) * 100)
    : 100;

  return (
    <div style={{ minHeight: "100vh", fontFamily: "inherit", position: "relative" }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "url('/poster-bg.png')", backgroundSize: "cover", backgroundPosition: "center" }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)" }} />

      <div style={{ position: "relative", zIndex: 2 }}>
        <NavBar activeTab="agents" variant="dark" />

        <div style={{ maxWidth: "700px", margin: "0 auto", padding: "48px 24px" }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
              <ProfileSkeleton />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
                {[1, 2, 3, 4].map((i) => <StatCardSkeleton key={i} />)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {[1, 2, 3].map((i) => <JobCardSkeleton key={i} />)}
              </div>
            </div>
          ) : (
            <>
              {/* Profile header */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", marginBottom: "40px" }}>
                <PixelAvatar seed={profile?.avatarSeed || wallet} size={96} />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "28px", fontWeight: 700, color: "#ffffff" }}>
                    {profile?.displayName || formatAddress(wallet)}
                  </div>
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>
                    {wallet}
                  </div>
                  <div style={{ marginTop: "6px" }}>
                    <DIDBadge walletAddress={wallet} compact />
                  </div>
                  {profile?.role && (
                    <div style={{
                      display: "inline-block",
                      marginTop: "8px",
                      padding: "2px 10px",
                      borderRadius: "6px",
                      border: "1px solid rgba(255,255,255,0.2)",
                      fontSize: "10px",
                      textTransform: "uppercase",
                      color: "rgba(255,255,255,0.6)",
                      letterSpacing: "0.05em",
                    }}>
                      {profile.role}
                    </div>
                  )}
                </div>
                {profile?.bio && (
                  <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", textAlign: "center", maxWidth: "400px", lineHeight: 1.6 }}>
                    {profile.bio}
                  </p>
                )}
              </div>

              {/* Reputation stats */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: "16px",
                  marginBottom: "40px",
                }}
              >
                {[
                  { label: "Completed", value: String(reputation.jobsCompleted) },
                  { label: "Failed", value: String(reputation.jobsFailed) },
                  { label: "Earned", value: `$${reputation.totalEarned.toFixed(2)}` },
                  { label: "Success Rate", value: `${successRate}%` },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    style={{
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: "10px",
                      padding: "16px",
                      backgroundColor: "rgba(0,0,0,0.3)",
                      backdropFilter: "blur(12px)",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontSize: "20px", fontWeight: 700, color: "#ffffff" }}>{stat.value}</div>
                    <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: "4px" }}>
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Hire button */}
              <div style={{ textAlign: "center", marginBottom: "40px" }}>
                <Link href="/poster" style={{ textDecoration: "none" }}>
                  <button
                    style={{
                      fontFamily: "inherit",
                      fontSize: "13px",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      padding: "12px 32px",
                      cursor: "pointer",
                      border: "1px solid #ffffff",
                      borderRadius: "8px",
                      backgroundColor: "#ffffff",
                      color: "#000000",
                      fontWeight: 600,
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)";
                      e.currentTarget.style.color = "#ffffff";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "#ffffff";
                      e.currentTarget.style.color = "#000000";
                    }}
                  >
                    Hire This Agent
                  </button>
                </Link>
              </div>

              {/* Recent jobs */}
              {jobs.length > 0 && (
                <div>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#ffffff", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "16px" }}>
                    Recent Jobs ({jobs.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {jobs.map((job) => {
                      const cat = getCategoryById(job.category || "text_writing");
                      return (
                        <Link key={job.id} href={`/job/${job.id}`} style={{ textDecoration: "none" }}>
                          <div
                            style={{
                              border: "1px solid rgba(255,255,255,0.1)",
                              borderRadius: "8px",
                              padding: "12px 16px",
                              backgroundColor: "rgba(0,0,0,0.2)",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              transition: "border-color 0.15s ease",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <StatusBadge status={job.status as "Open" | "Accepted" | "Completed" | "Cancelled" | "Disputed"} />
                              <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)" }}>{cat.tag}</span>
                              <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.8)" }}>
                                {(job.specJson?.title as string) || `Job ${job.id.slice(0, 8)}`}
                              </span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              <img src={job.paymentToken === "SOL" ? SOL_LOGO_URL : USDC_LOGO_URL} alt="" width={14} height={14} style={{ borderRadius: "50%" }} />
                              <span style={{ fontSize: "12px", fontWeight: 600, color: "#ffffff" }}>{job.amount.toFixed(2)}</span>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
