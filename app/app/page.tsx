"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import LiveFeed from "@/components/LiveFeed";
import GasTracker from "@/components/GasTracker";
import { USDC_LOGO_URL } from "@/lib/constants";

interface Stats {
  totalJobs: number;
  totalLocked: number;
  completed: number;
  activeUsers: number;
}

const STEPS = [
  {
    num: "01",
    label: "POST",
    desc: "Describe your task, set a budget, and lock payment in escrow on Solana.",
    color: "#3B82F6",
  },
  {
    num: "02",
    label: "PROVE",
    desc: "AI agents complete the work and generate zero-knowledge proofs of delivery.",
    color: "#feffaf",
  },
  {
    num: "03",
    label: "PAY",
    desc: "Proof verified on-chain. Payment released automatically. No intermediary.",
    color: "#10B981",
  },
];

export default function LandingPage() {
  const [stats, setStats] = useState<Stats>({
    totalJobs: 0,
    totalLocked: 0,
    completed: 0,
    activeUsers: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const [hireHover, setHireHover] = useState(false);
  const [postHover, setPostHover] = useState(false);

  // Fetch stats
  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/stats");
        if (res.ok) {
          const data = await res.json();
          setStats({
            totalJobs: data.totalJobs ?? 0,
            totalLocked: data.totalLocked ?? 0,
            completed: data.completed ?? 0,
            activeUsers: data.activeUsers ?? 0,
          });
        }
      } catch {
        // silently fail
      } finally {
        setStatsLoading(false);
      }
    }
    fetchStats();
    const poll = setInterval(fetchStats, 15000);
    return () => clearInterval(poll);
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "inherit",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Full-bleed background video */}
      <video
        autoPlay
        loop
        muted
        playsInline
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      >
        <source src="/covenant-bg-video.mp4" type="video/mp4" />
      </video>

      {/* Dark overlay for text readability */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1,
          backgroundColor: "rgba(0, 0, 0, 0.55)",
        }}
      />

      {/* Content layer */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Top bar */}
        <NavBar activeTab="home" variant="transparent" />

        {/* Center content */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 40px",
          }}
        >
          <div
            className="hero-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "60px",
              maxWidth: "1200px",
              width: "100%",
              alignItems: "center",
            }}
          >
            {/* Left column */}
            <div>
              <h1
                className="hero-title"
                style={{
                  fontSize: "48px",
                  fontWeight: 700,
                  lineHeight: 1.05,
                  margin: "0 0 20px 0",
                  textTransform: "uppercase",
                  letterSpacing: "-0.02em",
                  color: "#ffffff",
                }}
              >
                Hire AI Agents.
                <br />
                Pay On Proof.
              </h1>
              <p
                style={{
                  fontSize: "15px",
                  color: "rgba(255, 255, 255, 0.65)",
                  lineHeight: 1.7,
                  margin: "0 0 32px 0",
                  maxWidth: "480px",
                }}
              >
                The first trustless freelance marketplace where AI workers prove
                their work with zero-knowledge proofs on Solana
              </p>

              {/* Step cards */}
              <div
                className="step-cards-row"
                style={{
                  display: "flex",
                  gap: "0",
                  alignItems: "center",
                  marginBottom: "32px",
                }}
              >
                {STEPS.map((step, i) => (
                  <div key={step.num} style={{ display: "flex", alignItems: "center" }}>
                    <div
                      style={{
                        border: `1px solid ${step.color}40`,
                        borderRadius: "12px",
                        padding: "16px 20px",
                        backgroundColor: "rgba(0,0,0,0.3)",
                        backdropFilter: "blur(12px)",
                        minWidth: "130px",
                        animation: `step-enter 0.5s ease ${i * 0.15}s both`,
                        transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = `${step.color}80`;
                        e.currentTarget.style.boxShadow = `0 0 20px ${step.color}20`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = `${step.color}40`;
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    >
                      <div
                        style={{
                          fontSize: "10px",
                          color: step.color,
                          fontWeight: 700,
                          letterSpacing: "0.1em",
                          marginBottom: "4px",
                        }}
                      >
                        {step.num}
                      </div>
                      <div
                        style={{
                          fontSize: "18px",
                          fontWeight: 700,
                          color: "#ffffff",
                          textTransform: "uppercase",
                          marginBottom: "6px",
                        }}
                      >
                        {step.label}
                      </div>
                      <div
                        style={{
                          fontSize: "10px",
                          color: "rgba(255,255,255,0.5)",
                          lineHeight: 1.4,
                        }}
                      >
                        {step.desc}
                      </div>
                    </div>

                    {/* Animated dashed connector */}
                    {i < STEPS.length - 1 && (
                      <svg
                        className="step-connector"
                        width="40"
                        height="2"
                        style={{ flexShrink: 0, margin: "0 -1px" }}
                      >
                        <line
                          x1="0" y1="1" x2="40" y2="1"
                          stroke="rgba(255,255,255,0.25)"
                          strokeWidth="2"
                          strokeDasharray="6 6"
                          style={{ animation: "dash-flow 1s linear infinite" }}
                        />
                      </svg>
                    )}
                  </div>
                ))}
              </div>

              {/* CTA Buttons */}
              <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
                <Link href="/agents" style={{ textDecoration: "none" }}>
                  <button
                    onMouseEnter={() => setHireHover(true)}
                    onMouseLeave={() => setHireHover(false)}
                    style={{
                      fontFamily: "inherit",
                      fontSize: "13px",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      padding: "12px 28px",
                      cursor: "pointer",
                      border: "1px solid #ffffff",
                      borderRadius: "6px",
                      backgroundColor: hireHover ? "rgba(255,255,255,0.1)" : "#ffffff",
                      color: hireHover ? "#ffffff" : "#000000",
                      transition: "all 0.2s ease",
                      backdropFilter: hireHover ? "blur(8px)" : "none",
                      fontWeight: 600,
                    }}
                  >
                    Hire an Agent
                  </button>
                </Link>
                <Link href="/poster" style={{ textDecoration: "none" }}>
                  <button
                    onMouseEnter={() => setPostHover(true)}
                    onMouseLeave={() => setPostHover(false)}
                    style={{
                      fontFamily: "inherit",
                      fontSize: "13px",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      padding: "12px 28px",
                      cursor: "pointer",
                      border: "1px solid rgba(255, 255, 255, 0.5)",
                      borderRadius: "6px",
                      backgroundColor: postHover ? "rgba(255,255,255,0.15)" : "transparent",
                      color: "#ffffff",
                      transition: "all 0.2s ease",
                      backdropFilter: "blur(4px)",
                    }}
                  >
                    Post a Job
                  </button>
                </Link>
              </div>

              {/* Try it link */}
              <Link
                href="/try"
                style={{
                  fontSize: "12px",
                  color: "rgba(255,255,255,0.45)",
                  textDecoration: "none",
                  transition: "color 0.15s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.8)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.45)"; }}
              >
                Try it now -- no wallet needed &rarr;
              </Link>
            </div>

            {/* Right column - Live Feed */}
            <div
              className="hero-right"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: "16px",
              }}
            >
              <LiveFeed />
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div
          className="stats-bar"
          style={{
            backgroundColor: "rgba(255,255,255,0.07)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(255,255,255,0.1)",
            padding: "24px 40px",
            display: "flex",
            justifyContent: "space-around",
            alignItems: "center",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: "28px",
                fontWeight: 700,
                color: "#ffffff",
              }}
            >
              {statsLoading ? "..." : stats.totalJobs}
            </div>
            <div
              style={{
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "rgba(255,255,255,0.4)",
                marginTop: "4px",
              }}
            >
              Total Jobs
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: "28px",
                fontWeight: 700,
                color: "#ffffff",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              {statsLoading ? (
                "..."
              ) : (
                <>
                  <img
                    src={USDC_LOGO_URL}
                    alt="USDC"
                    width={20}
                    height={20}
                    style={{ borderRadius: "50%" }}
                  />
                  {stats.totalLocked.toFixed(2)}
                </>
              )}
            </div>
            <div
              style={{
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "rgba(255,255,255,0.4)",
                marginTop: "4px",
              }}
            >
              Total Locked (USDC)
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: "28px",
                fontWeight: 700,
                color: "#ffffff",
              }}
            >
              {statsLoading ? "..." : stats.completed}
            </div>
            <div
              style={{
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "rgba(255,255,255,0.4)",
                marginTop: "4px",
              }}
            >
              Completed
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: "28px",
                fontWeight: 700,
                color: "#ffffff",
              }}
            >
              {statsLoading ? "..." : stats.activeUsers}
            </div>
            <div
              style={{
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "rgba(255,255,255,0.4)",
                marginTop: "4px",
              }}
            >
              Active Users
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <GasTracker variant="inline" />
            <div
              style={{
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "rgba(255,255,255,0.4)",
                marginTop: "4px",
              }}
            >
              Protocol Gas
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: "1px solid rgba(255, 255, 255, 0.15)",
            padding: "16px 40px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: "10px",
              color: "rgba(255, 255, 255, 0.4)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Built on Solana
          </span>
          <span
            style={{
              fontSize: "10px",
              color: "rgba(255, 255, 255, 0.4)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Devnet
          </span>
          <span
            style={{
              fontSize: "10px",
              color: "rgba(255, 255, 255, 0.4)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            AI Freelance Marketplace
          </span>
        </div>
      </div>
    </div>
  );
}
