"use client";

import { useState } from "react";
import { useConnector } from "@solana/connector/react";
import NavBar from "@/components/NavBar";
import JobList from "@/components/JobList";
import ReputationBadge from "@/components/ReputationBadge";
import AsciiAnimation from "@/components/AsciiAnimation";
import useProtocolStats from "@/hooks/useProtocolStats";
import { USDC_LOGO_URL } from "@/lib/constants";

export default function TakerPage() {
  const { account } = useConnector();
  const walletPubkey = account || undefined;
  const { stats, loading: statsLoading } = useProtocolStats();
  const [activeFilter, setActiveFilter] = useState<"all" | "mine">("all");
  const [allHover, setAllHover] = useState(false);
  const [mineHover, setMineHover] = useState(false);

  const filterBtnStyle = (
    isActive: boolean,
    isHovered: boolean
  ): React.CSSProperties => ({
    fontFamily: "inherit",
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    padding: "4px 16px",
    cursor: "pointer",
    border: "1px solid rgba(255,255,255,0.25)",
    borderRadius: "6px",
    backgroundColor: isActive || isHovered ? "rgba(255,255,255,0.15)" : "transparent",
    color: isActive || isHovered ? "#ffffff" : "rgba(255,255,255,0.5)",
    backdropFilter: "blur(4px)",
    transition: "all 0.15s ease",
  });

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
        <NavBar activeTab="taker" variant="dark" />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "65% 35%",
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
              display: "flex",
              gap: "8px",
              marginBottom: "24px",
            }}
          >
            <button
              onClick={() => setActiveFilter("all")}
              onMouseEnter={() => setAllHover(true)}
              onMouseLeave={() => setAllHover(false)}
              style={filterBtnStyle(activeFilter === "all", allHover)}
            >
              All Jobs
            </button>
            <button
              onClick={() => setActiveFilter("mine")}
              onMouseEnter={() => setMineHover(true)}
              onMouseLeave={() => setMineHover(false)}
              style={filterBtnStyle(activeFilter === "mine", mineHover)}
            >
              My Jobs
            </button>
          </div>

          <JobList filter={activeFilter} walletPubkey={walletPubkey} variant="dark" />
        </div>

        {/* Right column - sticky sidebar */}
        <div>
          <div style={{ position: "sticky", top: "24px" }}>
            <div style={{ marginBottom: "24px" }}>
              <div
                style={{
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "rgba(255,255,255,0.5)",
                  marginBottom: "8px",
                }}
              >
                Your Reputation
              </div>
              <ReputationBadge wallet={walletPubkey || null} />
            </div>

            <div
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "10px",
                padding: "16px",
                marginBottom: "24px",
                backgroundColor: "rgba(255,255,255,0.05)",
                backdropFilter: "blur(12px)",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "rgba(255,255,255,0.5)",
                  marginBottom: "12px",
                }}
              >
                Protocol Stats
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "12px",
                  }}
                >
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>Total Jobs</span>
                  <span style={{ fontWeight: 600, color: "#ffffff" }}>
                    {statsLoading ? "..." : stats.totalJobs}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "12px",
                  }}
                >
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>Total Locked</span>
                  <span style={{ fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    {statsLoading ? "..." : (
                      <>
                        <img src={USDC_LOGO_URL} alt="USDC" width={12} height={12} style={{ borderRadius: "50%" }} />
                        {stats.totalLocked.toFixed(2)}
                      </>
                    )}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "12px",
                  }}
                >
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>Completed</span>
                  <span style={{ fontWeight: 600, color: "#ffffff" }}>
                    {statsLoading ? "..." : stats.completed}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "12px",
                  }}
                >
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>Success Rate</span>
                  <span style={{ fontWeight: 600, color: "#ffffff" }}>
                    {statsLoading ? "..." : `${stats.successRate}%`}
                  </span>
                </div>
              </div>
            </div>

            <AsciiAnimation scene="idle" variant="dark" />
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
