"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import TopographicBlob from "@/components/TopographicBlob";
import GasTracker from "@/components/GasTracker";
import { USDC_LOGO_URL, SOL_LOGO_URL } from "@/lib/constants";

interface ActivityItem {
  text: string;
  status: string;
  txHash: string | null;
}

interface Stats {
  totalJobs: number;
  totalLocked: number;
  completed: number;
  activeUsers: number;
}

function parseActivityItem(raw: { text: string; txHash: string | null } | string): ActivityItem {
  const text = typeof raw === "string" ? raw : raw.text;
  const txHash = typeof raw === "string" ? null : raw.txHash;
  if (text.includes("COMPLETE") || text.includes("VERIFIED")) {
    return { text, status: "completed", txHash };
  }
  if (text.includes("ACCEPTED")) {
    return { text, status: "accepted", txHash };
  }
  return { text, status: "created", txHash };
}

export default function LandingPage() {
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([
    { text: "LOADING ACTIVITY...", status: "created", txHash: null },
  ]);
  const [stats, setStats] = useState<Stats>({
    totalJobs: 0,
    totalLocked: 0,
    completed: 0,
    activeUsers: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const [primaryHover, setPrimaryHover] = useState(false);
  const [ghostHover, setGhostHover] = useState(false);

  // Fetch real activity from DB
  useEffect(() => {
    async function fetchActivity() {
      try {
        const res = await fetch("/api/activity");
        if (res.ok) {
          const data = await res.json();
          if (data.items && data.items.length > 0) {
            setActivityItems(
              data.items.slice(0, 5).map((item: { text: string; txHash: string | null } | string) => parseActivityItem(item))
            );
          }
        }
      } catch {
        // silently fall back to current items
      }
    }
    fetchActivity();
    const poll = setInterval(fetchActivity, 15000);
    return () => clearInterval(poll);
  }, []);

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

  const navLinkStyle: React.CSSProperties = {
    fontSize: "10px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    textDecoration: "none",
    color: "rgba(255, 255, 255, 0.4)",
    transition: "color 0.15s ease",
  };

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
          backgroundColor: "rgba(0, 0, 0, 0.45)",
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
              gap: "80px",
              maxWidth: "1100px",
              width: "100%",
              alignItems: "center",
            }}
          >
            {/* Left column */}
            <div>
              <h1
                className="hero-title"
                style={{
                  fontSize: "56px",
                  fontWeight: 700,
                  lineHeight: 1.0,
                  margin: "0 0 28px 0",
                  textTransform: "uppercase",
                  letterSpacing: "-0.02em",
                  color: "#ffffff",
                }}
              >
                Trustless
                <br />
                Work
                <br />
                Delivery
              </h1>
              <p
                style={{
                  fontSize: "14px",
                  color: "rgba(255, 255, 255, 0.7)",
                  lineHeight: 1.7,
                  margin: "0 0 36px 0",
                  maxWidth: "420px",
                }}
              >
                Lock payment on-chain. Prove work with zero-knowledge proofs.
                Get paid automatically. No intermediary. No trust.
              </p>
              <div style={{ display: "flex", gap: "12px" }}>
                <Link href="/poster" style={{ textDecoration: "none" }}>
                  <button
                    onMouseEnter={() => setPrimaryHover(true)}
                    onMouseLeave={() => setPrimaryHover(false)}
                    style={{
                      fontFamily: "inherit",
                      fontSize: "13px",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      padding: "10px 24px",
                      cursor: "pointer",
                      border: "1px solid #ffffff",
                      borderRadius: "6px",
                      backgroundColor: primaryHover ? "rgba(255,255,255,0.1)" : "#ffffff",
                      color: primaryHover ? "#ffffff" : "#000000",
                      transition: "all 0.2s ease",
                      backdropFilter: primaryHover ? "blur(8px)" : "none",
                    }}
                  >
                    Post a Job
                  </button>
                </Link>
                <Link href="/taker" style={{ textDecoration: "none" }}>
                  <button
                    onMouseEnter={() => setGhostHover(true)}
                    onMouseLeave={() => setGhostHover(false)}
                    style={{
                      fontFamily: "inherit",
                      fontSize: "13px",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      padding: "10px 24px",
                      cursor: "pointer",
                      border: "1px solid rgba(255, 255, 255, 0.5)",
                      borderRadius: "6px",
                      backgroundColor: ghostHover ? "rgba(255,255,255,0.15)" : "transparent",
                      color: "#ffffff",
                      transition: "all 0.2s ease",
                      backdropFilter: "blur(4px)",
                    }}
                  >
                    Find Work
                  </button>
                </Link>
              </div>

              {/* Navigation links */}
              <div
                style={{
                  display: "flex",
                  gap: "20px",
                  marginTop: "24px",
                }}
              >
                <Link href="/arena" style={navLinkStyle} onMouseEnter={(e) => { e.currentTarget.style.color = "#ffffff"; }} onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255, 255, 255, 0.4)"; }}>
                  Agent Arena
                </Link>
                <Link href="/proof" style={navLinkStyle} onMouseEnter={(e) => { e.currentTarget.style.color = "#ffffff"; }} onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255, 255, 255, 0.4)"; }}>
                  ZK Proof
                </Link>
                <Link href="/architecture" style={navLinkStyle} onMouseEnter={(e) => { e.currentTarget.style.color = "#ffffff"; }} onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255, 255, 255, 0.4)"; }}>
                  Architecture
                </Link>
                <Link href="/admin" style={navLinkStyle} onMouseEnter={(e) => { e.currentTarget.style.color = "#ffffff"; }} onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255, 255, 255, 0.4)"; }}>
                  DB Explorer
                </Link>
              </div>
            </div>

            {/* Right column */}
            <div
              className="hero-right"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: "16px",
              }}
            >
              <TopographicBlob width="320px" height="200px" />

              {/* Multi-line activity feed */}
              <div
                style={{
                  border: "1px solid rgba(255, 255, 255, 0.25)",
                  borderRadius: "8px",
                  padding: "12px 16px",
                  fontSize: "11px",
                  fontFamily: "inherit",
                  width: "320px",
                  backgroundColor: "rgba(0, 0, 0, 0.3)",
                  backdropFilter: "blur(8px)",
                  maxHeight: "180px",
                  overflowY: "auto",
                }}
              >
                <div
                  style={{
                    color: "#ffffff",
                    fontWeight: 600,
                    marginBottom: "8px",
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  LIVE ACTIVITY
                </div>
                {activityItems.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      marginBottom: "6px",
                      lineHeight: 1.4,
                      display: "flex",
                      gap: "6px",
                    }}
                  >
                    <span style={{ color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>
                      {new Date().toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })}
                    </span>
                    <span
                      style={{
                        color:
                          item.status === "completed"
                            ? "#86efac"
                            : item.status === "accepted"
                            ? "#fde68a"
                            : "rgba(255, 255, 255, 0.7)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      {item.text}
                      {item.txHash && (
                        <a
                          href={`https://explorer.solana.com/tx/${item.txHash}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "2px",
                            color: "#5ba4f5",
                            textDecoration: "none",
                            flexShrink: 0,
                          }}
                        >
                          <img src={SOL_LOGO_URL} alt="SOL" width={10} height={10} style={{ borderRadius: "50%" }} />
                          [tx]
                        </a>
                      )}
                    </span>
                  </div>
                ))}
              </div>
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
            Trustless Escrow Protocol
          </span>
        </div>
      </div>
    </div>
  );
}
