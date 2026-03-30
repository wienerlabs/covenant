"use client";

import { useState, useCallback } from "react";
import { useConnector } from "@solana/connector/react";
import NavBar from "@/components/NavBar";
import CreateJobForm from "@/components/CreateJobForm";
import JobCard from "@/components/JobCard";
import useJobList from "@/hooks/useJobList";

const STEPS = [
  { num: "01", title: "Create Job", desc: "Set payment, deadline, and minimum word count." },
  { num: "02", title: "Escrow Funds", desc: "USDC is locked in the on-chain escrow." },
  { num: "03", title: "Worker Delivers", desc: "Worker submits content with a ZK proof." },
  { num: "04", title: "Auto Release", desc: "Funds release when the proof verifies." },
];

export default function PosterPage() {
  const { account } = useConnector();
  const walletPubkey = account || undefined;
  const { jobs, loading, refetch } = useJobList({
    filter: "mine",
    walletPubkey: walletPubkey || null,
  });
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const handleCancel = useCallback(
    async (jobId: string) => {
      if (!walletPubkey) return;
      setCancellingId(jobId);
      try {
        const response = await fetch(`/api/jobs/${jobId}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signerWallet: walletPubkey }),
        });
        if (!response.ok) {
          const data = await response.json();
          alert(data.error || "Failed to cancel job");
          return;
        }
        refetch();
      } catch {
        alert("Failed to cancel job");
      } finally {
        setCancellingId(null);
      }
    },
    [walletPubkey, refetch]
  );

  // Filter to only show poster's jobs
  const myJobs = walletPubkey
    ? jobs.filter((j) => j.posterWallet === walletPubkey)
    : [];

  return (
    <div style={{ minHeight: "100vh", fontFamily: "inherit", position: "relative" }}>
      {/* Full-bleed background */}
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
        <NavBar activeTab="poster" variant="dark" />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "40% 60%",
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "32px 24px",
            gap: "32px",
          }}
        >
          {/* Left column */}
          <div>
            <div
              style={{
                backgroundColor: "rgba(255,255,255,0.07)",
                backdropFilter: "blur(16px)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "10px",
                padding: "24px",
              }}
            >
              <CreateJobForm variant="dark" onJobCreated={refetch} />
            </div>

            <div
              style={{
                marginTop: "24px",
                backgroundColor: "rgba(255,255,255,0.05)",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "10px",
                padding: "20px",
              }}
            >
              <h3
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  margin: "0 0 20px 0",
                  color: "rgba(255,255,255,0.9)",
                }}
              >
                How It Works
              </h3>
              {STEPS.map((step) => (
                <div
                  key={step.num}
                  style={{
                    display: "flex",
                    gap: "12px",
                    marginBottom: "16px",
                    alignItems: "flex-start",
                  }}
                >
                  <span
                    style={{
                      fontSize: "18px",
                      fontWeight: 700,
                      color: "rgba(255,255,255,0.8)",
                      lineHeight: 1,
                      minWidth: "28px",
                    }}
                  >
                    {step.num}
                  </span>
                  <div>
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.03em",
                        marginBottom: "2px",
                        color: "#ffffff",
                      }}
                    >
                      {step.title}
                    </div>
                    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", lineHeight: 1.4 }}>
                      {step.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right column - sticky sidebar */}
          <div>
            <div style={{ position: "sticky", top: "24px" }}>
              <h2
                style={{
                  fontSize: "14px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  margin: "0 0 20px 0",
                  color: "#ffffff",
                }}
              >
                Your Active Jobs
              </h2>

              {loading ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {[0, 1].map((i) => (
                    <div
                      key={i}
                      style={{
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "10px",
                        padding: "20px",
                        height: "120px",
                        backgroundColor: "rgba(255,255,255,0.05)",
                        backdropFilter: "blur(8px)",
                      }}
                    >
                      <div
                        style={{
                          width: "80px",
                          height: "14px",
                          backgroundColor: "rgba(255,255,255,0.1)",
                          borderRadius: "4px",
                          marginBottom: "12px",
                        }}
                      />
                      <div
                        style={{
                          width: "140px",
                          height: "18px",
                          backgroundColor: "rgba(255,255,255,0.08)",
                          borderRadius: "4px",
                        }}
                      />
                    </div>
                  ))}
                </div>
              ) : myJobs.length === 0 ? (
                <div
                  style={{
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "10px",
                    padding: "32px",
                    textAlign: "center",
                    color: "rgba(255,255,255,0.4)",
                    fontSize: "12px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    backgroundColor: "rgba(255,255,255,0.03)",
                  }}
                >
                  {walletPubkey ? "No jobs yet. Create your first job!" : "Connect wallet to see your jobs"}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {myJobs.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      onCancel={cancellingId === job.id ? undefined : handleCancel}
                      connectedWallet={walletPubkey}
                      variant="dark"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
