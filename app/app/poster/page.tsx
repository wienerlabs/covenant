"use client";

import { useState, useEffect, useCallback } from "react";
import NavBar from "@/components/NavBar";
import CreateJobForm from "@/components/CreateJobForm";
import JobCard from "@/components/JobCard";

const MOCK_MY_JOBS = [
  {
    jobPda: "Cv7t2X9kFpHq3mNbRz1YWd4AeJcLn8Uf6GsKoQ5vBxT",
    job: {
      poster: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      taker: null,
      amount: 500_000_000,
      specHash: "a1b2c3d4e5f6",
      status: "Open" as const,
      createdAt: 1711756800,
      deadline: 1712361600,
      minWords: 2000,
    },
  },
  {
    jobPda: "5TgS4lGpZr6nOcXa3YXe5CfKdNo0Wh8ItMqLpS7xDzV",
    job: {
      poster: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      taker: "4LkOmQrStU5wXyZaB3cDeFgHiJ9kLmNoPqRsTuVwXyZa",
      amount: 750_000_000,
      specHash: "c3d4e5f6a1b2",
      status: "Completed" as const,
      createdAt: 1711584000,
      deadline: 1712188800,
      minWords: 3000,
    },
  },
];

const STEPS = [
  { num: "01", title: "Create Job", desc: "Set payment, deadline, and minimum word count." },
  { num: "02", title: "Escrow Funds", desc: "USDC is locked in the on-chain escrow." },
  { num: "03", title: "Worker Delivers", desc: "Worker submits content with a ZK proof." },
  { num: "04", title: "Auto Release", desc: "Funds release when the proof verifies." },
];

export default function PosterPage() {
  const myJobs = MOCK_MY_JOBS;
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  const handleAccept = useCallback(() => {}, []);

  return (
    <div style={{ minHeight: "100vh", fontFamily: "inherit" }}>
      <NavBar activeTab="poster" />

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
          <CreateJobForm />

          <div
            style={{
              marginTop: "32px",
              border: "1px solid #e0e0e0",
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
                    color: "#000000",
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
                    }}
                  >
                    {step.title}
                  </div>
                  <div style={{ fontSize: "11px", color: "#555555", lineHeight: 1.4 }}>
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
                      border: "1px solid #e0e0e0",
                      borderRadius: "10px",
                      padding: "20px",
                      height: "120px",
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: "80px",
                        height: "14px",
                        backgroundColor: "rgba(0,0,0,0.06)",
                        marginBottom: "12px",
                      }}
                    />
                    <div
                      style={{
                        width: "140px",
                        height: "18px",
                        backgroundColor: "rgba(0,0,0,0.06)",
                      }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {myJobs.map((entry) => (
                  <JobCard
                    key={entry.jobPda}
                    job={entry.job}
                    jobPda={entry.jobPda}
                    onAccept={handleAccept}
                    connectedWallet="9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
