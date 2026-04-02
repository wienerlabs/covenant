"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import StatusBadge from "@/components/StatusBadge";
import JobTimeline from "@/components/JobTimeline";
import { USDC_LOGO_URL, SOL_LOGO_URL } from "@/lib/constants";
import { getCategoryById } from "@/lib/categories";
import { formatAddress } from "@/lib/format";

interface DisputeData {
  id: string;
  jobId: string;
  raisedBy: string;
  reason: string;
  status: string;
  resolution: string | null;
  createdAt: string;
}

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
  title?: string;
  status: string;
  category?: string;
  amount: number;
  paymentToken?: string;
  description?: string;
  posterWallet: string;
  takerWallet?: string | null;
  deadline: string;
  specHash?: string;
  txHash?: string | null;
  specJson?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  submissions?: Submission[];
}

function formatJobDate(dateStr: string): string {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export default function JobDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [job, setJob] = useState<Job | null>(null);
  const [disputes, setDisputes] = useState<DisputeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    async function fetchJob() {
      try {
        const [jobRes, disputeRes] = await Promise.all([
          fetch(`/api/jobs/${id}`),
          fetch(`/api/disputes?jobId=${id}`),
        ]);
        if (!jobRes.ok) {
          setError(jobRes.status === 404 ? "Job not found." : "Failed to load job.");
          return;
        }
        const data = await jobRes.json();
        setJob(data);
        if (disputeRes.ok) {
          setDisputes(await disputeRes.json());
        }
      } catch {
        setError("Failed to load job.");
      } finally {
        setLoading(false);
      }
    }
    fetchJob();
  }, [id]);

  const handleAccept = async () => {
    if (!job) return;
    setActionLoading("accept");
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      });
      if (res.ok) {
        const updated = await res.json();
        setJob(updated);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    if (!job) return;
    setActionLoading("cancel");
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (res.ok) {
        const updated = await res.json();
        setJob(updated);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const specTitle =
    job?.title ||
    (job?.specJson && typeof job.specJson === "object"
      ? (job.specJson as Record<string, unknown>).title as string | undefined
      : undefined) ||
    `Job ${formatAddress(id)}`;

  const specDescription =
    job?.description ||
    (job?.specJson && typeof job.specJson === "object"
      ? (job.specJson as Record<string, unknown>).description as string | undefined
      : undefined);

  const categoryInfo = getCategoryById(job?.category || "text_writing");

  const labelStyle: React.CSSProperties = {
    fontSize: "10px",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: "rgba(255,255,255,0.4)",
    marginBottom: "4px",
  };

  const valueStyle: React.CSSProperties = {
    fontSize: "13px",
    color: "rgba(255,255,255,0.85)",
    wordBreak: "break-all",
  };

  const cardStyle: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "12px",
    backgroundColor: "rgba(255,255,255,0.07)",
    backdropFilter: "blur(16px)",
    padding: "28px",
  };

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      {/* Background */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          backgroundImage: "url('/poster-bg.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1,
          backgroundColor: "rgba(0,0,0,0.6)",
        }}
      />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 2 }}>
        <NavBar activeTab="taker" variant="dark" />

        <div style={{ maxWidth: "760px", margin: "40px auto", padding: "0 24px", paddingBottom: "80px" }}>
          {/* Back link */}
          <Link
            href="/taker"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "rgba(255,255,255,0.45)",
              textDecoration: "none",
              marginBottom: "28px",
              transition: "color 0.15s ease",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#fff"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.45)"; }}
          >
            ← Back to Find Work
          </Link>

          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div style={cardStyle}>
                <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
                  <div className="shimmer" style={{ width: "70px", height: "20px", borderRadius: "4px" }} />
                  <div className="shimmer" style={{ width: "120px", height: "20px", borderRadius: "6px" }} />
                </div>
                <div className="shimmer" style={{ width: "80%", height: "28px", borderRadius: "4px", marginBottom: "20px" }} />
                <div className="shimmer" style={{ width: "150px", height: "32px", borderRadius: "4px", marginBottom: "20px" }} />
                <div className="shimmer" style={{ width: "100%", height: "60px", borderRadius: "4px" }} />
              </div>
              <div style={cardStyle}>
                <div className="shimmer" style={{ width: "100px", height: "12px", borderRadius: "4px", marginBottom: "20px" }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i}>
                      <div className="shimmer" style={{ width: "60px", height: "10px", borderRadius: "4px", marginBottom: "6px" }} />
                      <div className="shimmer" style={{ width: "180px", height: "14px", borderRadius: "4px" }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : error ? (
            <div style={{ ...cardStyle, textAlign: "center", color: "rgba(255,100,100,0.8)", padding: "64px" }}>
              {error}
            </div>
          ) : job ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Header card */}
              <div style={cardStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
                  <StatusBadge status={job.status as "Open" | "Accepted" | "Completed" | "Cancelled" | "Disputed"} />
                  <span style={{
                    fontSize: "10px",
                    padding: "2px 8px",
                    borderRadius: "6px",
                    border: "1px solid rgba(255,255,255,0.15)",
                    backgroundColor: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.7)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}>
                    {categoryInfo.tag} · {categoryInfo.label}
                  </span>
                </div>

                <h1 style={{
                  fontSize: "28px",
                  fontWeight: 700,
                  color: "#fff",
                  margin: "0 0 20px 0",
                  lineHeight: 1.2,
                }}>
                  {specTitle}
                </h1>

                {/* Amount */}
                <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
                  <img
                    src={job.paymentToken === "SOL" ? SOL_LOGO_URL : USDC_LOGO_URL}
                    alt={job.paymentToken || "USDC"}
                    width={24}
                    height={24}
                    style={{ borderRadius: "50%" }}
                  />
                  <span style={{ fontSize: "32px", fontWeight: 700, color: "#fff" }}>
                    {job.amount.toFixed(2)}
                  </span>
                  <span style={{ fontSize: "16px", color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>
                    {job.paymentToken || "USDC"}
                  </span>
                </div>

                {/* Description */}
                {specDescription && (
                  <div style={{ marginBottom: "8px" }}>
                    <div style={labelStyle}>Description</div>
                    <div style={{ ...valueStyle, lineHeight: 1.7, fontSize: "14px" }}>
                      {specDescription}
                    </div>
                  </div>
                )}
              </div>

              {/* Details card */}
              <div style={cardStyle}>
                <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.4)", marginBottom: "20px" }}>
                  Job Details
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                  <div>
                    <div style={labelStyle}>Poster Wallet</div>
                    <div style={valueStyle}>{formatAddress(job.posterWallet)}</div>
                    <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.25)", marginTop: "2px", wordBreak: "break-all" }}>
                      {job.posterWallet}
                    </div>
                  </div>
                  {job.takerWallet && (
                    <div>
                      <div style={labelStyle}>Taker Wallet</div>
                      <div style={valueStyle}>{formatAddress(job.takerWallet)}</div>
                      <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.25)", marginTop: "2px", wordBreak: "break-all" }}>
                        {job.takerWallet}
                      </div>
                    </div>
                  )}
                  <div>
                    <div style={labelStyle}>Deadline</div>
                    <div style={valueStyle}>{formatJobDate(job.deadline)}</div>
                  </div>
                  <div>
                    <div style={labelStyle}>Category</div>
                    <div style={valueStyle}>{categoryInfo.description}</div>
                  </div>
                  {job.specHash && (
                    <div style={{ gridColumn: "1 / -1" }}>
                      <div style={labelStyle}>Spec Hash</div>
                      <div style={{ ...valueStyle, fontSize: "11px", fontFamily: "monospace", opacity: 0.7 }}>
                        {job.specHash}
                      </div>
                    </div>
                  )}
                  {job.txHash && (
                    <div style={{ gridColumn: "1 / -1" }}>
                      <div style={labelStyle}>Transaction Hash</div>
                      <a
                        href={`https://explorer.solana.com/tx/${job.txHash}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: "11px",
                          fontFamily: "monospace",
                          color: "#5ba4f5",
                          textDecoration: "none",
                          wordBreak: "break-all",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <img src={SOL_LOGO_URL} alt="SOL" width={12} height={12} style={{ borderRadius: "50%" }} />
                        {job.txHash}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Submissions */}
              {job.submissions && job.submissions.length > 0 && (
                <div style={cardStyle}>
                  <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.4)", marginBottom: "20px" }}>
                    Submissions ({job.submissions.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {job.submissions.map((sub) => (
                      <div
                        key={sub.id}
                        style={{
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "8px",
                          padding: "16px",
                          backgroundColor: "rgba(255,255,255,0.04)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>
                            {formatAddress(sub.takerWallet)}
                          </span>
                          <span style={{
                            fontSize: "10px",
                            padding: "2px 8px",
                            borderRadius: "4px",
                            backgroundColor: sub.verified ? "rgba(134,239,172,0.15)" : "rgba(255,255,255,0.07)",
                            color: sub.verified ? "#86efac" : "rgba(255,255,255,0.4)",
                            border: `1px solid ${sub.verified ? "rgba(134,239,172,0.3)" : "rgba(255,255,255,0.1)"}`,
                          }}>
                            {sub.verified ? "Verified" : "Pending"}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
                          <div>
                            <div style={labelStyle}>Word Count</div>
                            <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.7)" }}>{sub.wordCount.toLocaleString()}</div>
                          </div>
                          <div>
                            <div style={labelStyle}>Text Hash</div>
                            <div style={{ fontSize: "11px", fontFamily: "monospace", color: "rgba(255,255,255,0.4)" }}>
                              {sub.textHash.slice(0, 16)}...
                            </div>
                          </div>
                          <div>
                            <div style={labelStyle}>Submitted</div>
                            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>
                              {formatJobDate(sub.createdAt)}
                            </div>
                          </div>
                        </div>
                        {sub.txHash && (
                          <div style={{ marginTop: "8px" }}>
                            <a
                              href={`https://explorer.solana.com/tx/${sub.txHash}?cluster=devnet`}
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
                              <img src={SOL_LOGO_URL} alt="SOL" width={10} height={10} style={{ borderRadius: "50%" }} />
                              View on Solana Explorer
                            </a>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Job Timeline */}
              <JobTimeline
                job={{
                  id: job.id,
                  status: job.status,
                  createdAt: job.createdAt || new Date().toISOString(),
                  updatedAt: job.updatedAt || new Date().toISOString(),
                  txHash: job.txHash,
                }}
                submissions={job.submissions || []}
              />

              {/* Disputes */}
              {disputes.length > 0 && (
                <div style={{ ...cardStyle, borderColor: "rgba(245,158,11,0.3)" }}>
                  <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em", color: "#f59e0b", marginBottom: "20px" }}>
                    Disputes ({disputes.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {disputes.map((d) => (
                      <div
                        key={d.id}
                        style={{
                          border: "1px solid rgba(245,158,11,0.15)",
                          borderRadius: "8px",
                          padding: "16px",
                          backgroundColor: "rgba(245,158,11,0.05)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                          <span style={{
                            fontSize: "10px",
                            padding: "2px 8px",
                            borderRadius: "4px",
                            backgroundColor: d.status === "open" ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.07)",
                            color: d.status === "open" ? "#f59e0b" : "rgba(255,255,255,0.5)",
                            border: `1px solid ${d.status === "open" ? "rgba(245,158,11,0.3)" : "rgba(255,255,255,0.1)"}`,
                            textTransform: "uppercase",
                          }}>
                            {d.status.replace("_", " ")}
                          </span>
                          <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)" }}>
                            {formatJobDate(d.createdAt)}
                          </span>
                        </div>
                        <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.8)", lineHeight: 1.6, marginBottom: "8px" }}>
                          {d.reason}
                        </div>
                        <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>
                          Raised by: {formatAddress(d.raisedBy)}
                        </div>
                        {d.resolution && (
                          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)", marginTop: "8px" }}>
                            {d.resolution}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: "flex", gap: "12px" }}>
                {job.status === "Open" && (
                  <button
                    onClick={handleAccept}
                    disabled={actionLoading === "accept"}
                    style={{
                      fontFamily: "inherit",
                      fontSize: "13px",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      padding: "12px 28px",
                      cursor: actionLoading ? "not-allowed" : "pointer",
                      border: "1px solid rgba(255,255,255,0.3)",
                      borderRadius: "8px",
                      backgroundColor: actionLoading === "accept" ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.12)",
                      color: "#fff",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {actionLoading === "accept" ? "Accepting..." : "Accept Job"}
                  </button>
                )}
                {job.status === "Accepted" && (
                  <button
                    onClick={() => alert("Use the Submit Work modal from the job list.")}
                    style={{
                      fontFamily: "inherit",
                      fontSize: "13px",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      padding: "12px 28px",
                      cursor: "pointer",
                      border: "1px solid rgba(255,255,255,0.3)",
                      borderRadius: "8px",
                      backgroundColor: "rgba(255,255,255,0.12)",
                      color: "#fff",
                      transition: "all 0.15s ease",
                    }}
                  >
                    Submit Work
                  </button>
                )}
                {job.status === "Open" && (
                  <button
                    onClick={handleCancel}
                    disabled={actionLoading === "cancel"}
                    style={{
                      fontFamily: "inherit",
                      fontSize: "13px",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      padding: "12px 28px",
                      cursor: actionLoading ? "not-allowed" : "pointer",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: "8px",
                      backgroundColor: "transparent",
                      color: "rgba(255,255,255,0.6)",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {actionLoading === "cancel" ? "Cancelling..." : "Cancel Job"}
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
