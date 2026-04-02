"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import { formatAddress } from "@/lib/format";

interface DisputeData {
  id: string;
  jobId: string;
  raisedBy: string;
  reason: string;
  status: string;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
}

function statusLabel(status: string): { text: string; color: string; bg: string; border: string } {
  switch (status) {
    case "open":
      return { text: "OPEN", color: "#f59e0b", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)" };
    case "resolved_poster":
      return { text: "RESOLVED (POSTER)", color: "#3b82f6", bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.3)" };
    case "resolved_taker":
      return { text: "RESOLVED (TAKER)", color: "#10b981", bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.3)" };
    case "dismissed":
      return { text: "DISMISSED", color: "rgba(255,255,255,0.4)", bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.15)" };
    default:
      return { text: status.toUpperCase(), color: "rgba(255,255,255,0.5)", bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.15)" };
  }
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function DisputesPage() {
  const [disputes, setDisputes] = useState<DisputeData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDisputes() {
      try {
        const res = await fetch("/api/disputes");
        if (res.ok) {
          setDisputes(await res.json());
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    fetchDisputes();
  }, []);

  const cardStyle: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "10px",
    backgroundColor: "rgba(255,255,255,0.06)",
    backdropFilter: "blur(16px)",
    padding: "20px",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "9px",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: "rgba(255,255,255,0.4)",
    marginBottom: "4px",
  };

  return (
    <div style={{ minHeight: "100vh", fontFamily: "inherit", position: "relative" }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "url('/poster-bg.png')", backgroundSize: "cover", backgroundPosition: "center" }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)" }} />

      <div style={{ position: "relative", zIndex: 2 }}>
        <NavBar activeTab="disputes" variant="dark" />

        <div style={{ maxWidth: "800px", margin: "0 auto", padding: "40px 24px" }}>
          <h1 style={{
            fontSize: "28px",
            fontWeight: 700,
            color: "#ffffff",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            margin: "0 0 32px 0",
            textAlign: "center",
          }}>
            Disputes
          </h1>

          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {[1, 2, 3].map((i) => (
                <div key={i} className="shimmer" style={{ height: "120px", borderRadius: "10px" }} />
              ))}
            </div>
          ) : disputes.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px", color: "rgba(255,255,255,0.4)", fontSize: "13px" }}>
              No disputes found. All jobs are running smoothly.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {disputes.map((dispute) => {
                const sl = statusLabel(dispute.status);
                return (
                  <div key={dispute.id} style={cardStyle}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{
                          fontSize: "10px",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          backgroundColor: sl.bg,
                          color: sl.color,
                          border: `1px solid ${sl.border}`,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}>
                          {sl.text}
                        </span>
                        <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)" }}>
                          {formatAddress(dispute.id)}
                        </span>
                      </div>
                      <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)" }}>
                        {formatDate(dispute.createdAt)}
                      </span>
                    </div>

                    <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.8)", marginBottom: "12px", lineHeight: 1.6 }}>
                      {dispute.reason}
                    </div>

                    <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
                      <div>
                        <div style={labelStyle}>Job</div>
                        <Link href={`/job/${dispute.jobId}`} style={{ fontSize: "11px", color: "#5ba4f5", textDecoration: "none" }}>
                          {formatAddress(dispute.jobId)}
                        </Link>
                      </div>
                      <div>
                        <div style={labelStyle}>Raised By</div>
                        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.7)" }}>
                          {formatAddress(dispute.raisedBy)}
                        </div>
                      </div>
                      {dispute.resolution && (
                        <div>
                          <div style={labelStyle}>Resolution</div>
                          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)" }}>
                            {dispute.resolution}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
