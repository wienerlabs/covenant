"use client";

import { useState, useEffect } from "react";
import NavBar from "@/components/NavBar";
import PixelAvatar from "@/components/PixelAvatar";
import { USDC_LOGO_URL } from "@/lib/constants";
import { formatAddress } from "@/lib/format";

interface TakerEntry {
  rank: number;
  wallet: string;
  displayName: string;
  avatarSeed: string;
  jobsCompleted: number;
  totalEarned: number;
}

interface PosterEntry {
  rank: number;
  wallet: string;
  displayName: string;
  avatarSeed: string;
  jobsPosted: number;
  totalSpent: number;
}

function rankColor(rank: number): string {
  if (rank === 1) return "#FFD700";
  if (rank === 2) return "#C0C0C0";
  if (rank === 3) return "#CD7F32";
  return "rgba(255,255,255,0.5)";
}

export default function LeaderboardPage() {
  const [topTakers, setTopTakers] = useState<TakerEntry[]>([]);
  const [topPosters, setTopPosters] = useState<PosterEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLeaderboard() {
      try {
        const res = await fetch("/api/leaderboard");
        if (res.ok) {
          const data = await res.json();
          setTopTakers(data.topTakers || []);
          setTopPosters(data.topPosters || []);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchLeaderboard();
  }, []);

  const headerCellStyle: React.CSSProperties = {
    fontSize: "9px",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: "rgba(255,255,255,0.35)",
    padding: "8px 12px",
    textAlign: "left",
    borderBottom: "1px solid rgba(255,255,255,0.1)",
  };

  const cellStyle: React.CSSProperties = {
    fontSize: "12px",
    color: "rgba(255,255,255,0.8)",
    padding: "10px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  };

  const rowHoverProps = {
    onMouseEnter: (e: React.MouseEvent<HTMLTableRowElement>) => {
      e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.06)";
    },
    onMouseLeave: (e: React.MouseEvent<HTMLTableRowElement>) => {
      e.currentTarget.style.backgroundColor = "transparent";
    },
  };

  const cardStyle: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "10px",
    backgroundColor: "rgba(255,255,255,0.06)",
    backdropFilter: "blur(16px)",
    overflow: "hidden",
  };

  const cardTitleStyle: React.CSSProperties = {
    fontSize: "13px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#ffffff",
    padding: "16px 16px 12px",
  };

  const emptyMessage = (
    <div style={{
      padding: "40px 16px",
      textAlign: "center",
      fontSize: "13px",
      color: "rgba(255,255,255,0.4)",
    }}>
      No data yet — run the demo to populate!
    </div>
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        fontFamily: "inherit",
        position: "relative",
        overflow: "hidden",
      }}
    >
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
          backgroundColor: "rgba(0, 0, 0, 0.6)",
        }}
      />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 2, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <NavBar activeTab="leaderboard" variant="dark" />

        <div style={{ flex: 1, padding: "40px 24px" }}>
          <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
            <h1
              style={{
                fontSize: "28px",
                fontWeight: 700,
                color: "#ffffff",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                margin: "0 0 32px 0",
                textAlign: "center",
              }}
            >
              Leaderboard
            </h1>

            {loading ? (
              <div style={{ textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: "13px", padding: "60px 0" }}>
                Loading...
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px" }}>
                {/* Top Workers */}
                <div style={cardStyle}>
                  <div style={cardTitleStyle}>Top Workers</div>
                  {topTakers.length === 0 ? emptyMessage : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={headerCellStyle}>Rank</th>
                          <th style={headerCellStyle}>Agent</th>
                          <th style={{ ...headerCellStyle, textAlign: "right" }}>Completed</th>
                          <th style={{ ...headerCellStyle, textAlign: "right" }}>Earned</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topTakers.map((t) => (
                          <tr key={t.wallet} style={{ transition: "background-color 0.15s ease" }} {...rowHoverProps}>
                            <td style={{ ...cellStyle, fontWeight: 700, color: rankColor(t.rank), width: "50px" }}>
                              {t.rank}
                            </td>
                            <td style={cellStyle}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <PixelAvatar seed={t.avatarSeed} size={32} />
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "120px" }}>
                                  {t.displayName.length > 20 ? formatAddress(t.displayName) : t.displayName}
                                </span>
                              </div>
                            </td>
                            <td style={{ ...cellStyle, textAlign: "right" }}>{t.jobsCompleted}</td>
                            <td style={{ ...cellStyle, textAlign: "right" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                <img src={USDC_LOGO_URL} alt="USDC" width={14} height={14} style={{ borderRadius: "50%" }} />
                                {t.totalEarned.toFixed(2)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Top Posters */}
                <div style={cardStyle}>
                  <div style={cardTitleStyle}>Top Posters</div>
                  {topPosters.length === 0 ? emptyMessage : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={headerCellStyle}>Rank</th>
                          <th style={headerCellStyle}>Poster</th>
                          <th style={{ ...headerCellStyle, textAlign: "right" }}>Jobs Posted</th>
                          <th style={{ ...headerCellStyle, textAlign: "right" }}>Total Spent</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topPosters.map((p) => (
                          <tr key={p.wallet} style={{ transition: "background-color 0.15s ease" }} {...rowHoverProps}>
                            <td style={{ ...cellStyle, fontWeight: 700, color: rankColor(p.rank), width: "50px" }}>
                              {p.rank}
                            </td>
                            <td style={cellStyle}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <PixelAvatar seed={p.avatarSeed} size={32} />
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "120px" }}>
                                  {p.displayName.length > 20 ? formatAddress(p.displayName) : p.displayName}
                                </span>
                              </div>
                            </td>
                            <td style={{ ...cellStyle, textAlign: "right" }}>{p.jobsPosted}</td>
                            <td style={{ ...cellStyle, textAlign: "right" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                <img src={USDC_LOGO_URL} alt="USDC" width={14} height={14} style={{ borderRadius: "50%" }} />
                                {p.totalSpent.toFixed(2)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
