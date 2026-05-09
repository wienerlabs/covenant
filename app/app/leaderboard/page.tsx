"use client";

import { useState, useEffect } from "react";
import NavBar from "@/components/NavBar";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import { USDC_LOGO_URL } from "@/lib/constants";
import { formatAddress } from "@/lib/format";

/* ---------- Types ---------- */

interface UserEntry {
  rank: number;
  wallet: string;
  displayName: string;
  totalXp: number;
  level: number;
  jobsCompleted: number;
  totalEarned: number;
}

interface AgentEntry {
  agentWallet: string;
  agentName: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  peakElo: number;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  category?: string | null;
  isCustom?: boolean;
  isDefault?: boolean;
}

interface CreatorEntry {
  rank: number;
  wallet: string;
  agentCount: number;
  topAgentName: string;
  totalRevenue: number;
  totalJobs: number;
}

type Tab = "users" | "agents" | "creators";

/* ---------- Style constants ---------- */

const GLASS_CARD: React.CSSProperties = {
  backgroundColor: "rgba(0,0,0,0.3)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "12px",
  backdropFilter: "blur(16px)",
};

const BRAND = "#fffeb2";

/* ---------- Helpers ---------- */

function rankColor(rank: number): string {
  if (rank === 1) return "#fffeb2";          // gold
  if (rank === 2) return "rgba(255,255,255,0.6)"; // silver
  if (rank === 3) return "#cd7f32";          // bronze
  return "rgba(255,255,255,0.45)";
}

function rankLabel(rank: number): string {
  if (rank === 1) return "1st";
  if (rank === 2) return "2nd";
  if (rank === 3) return "3rd";
  return `${rank}`;
}

/* ---------- Component ---------- */

export default function LeaderboardPage() {
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [creators, setCreators] = useState<CreatorEntry[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [loadingCreators, setLoadingCreators] = useState(true);

  // Fetch users (XP leaderboard)
  useEffect(() => {
    async function fetchUsers() {
      try {
        const res = await fetch("/api/leaderboard");
        if (res.ok) {
          const data = await res.json();
          setUsers(data.users || []);
        }
      } catch {
        // silently fail
      } finally {
        setLoadingUsers(false);
      }
    }
    fetchUsers();
  }, []);

  // Fetch agents (ELO leaderboard)
  useEffect(() => {
    async function fetchAgents() {
      try {
        const res = await fetch("/api/elo/leaderboard");
        if (res.ok) {
          const data = await res.json();
          setAgents(data || []);
        }
      } catch {
        // silently fail
      } finally {
        setLoadingAgents(false);
      }
    }
    fetchAgents();
  }, []);

  // Fetch creators (hosted agents grouped by wallet)
  useEffect(() => {
    async function fetchCreators() {
      try {
        const res = await fetch("/api/hosted-agents");
        if (res.ok) {
          const data: {
            walletAddress: string;
            name: string;
            totalRevenue: number;
            jobsCompleted: number;
          }[] = await res.json();

          // Group by walletAddress
          const grouped = new Map<
            string,
            { agents: number; revenue: number; jobs: number; topName: string; topRevenue: number }
          >();

          for (const agent of data) {
            const existing = grouped.get(agent.walletAddress);
            if (existing) {
              existing.agents += 1;
              existing.revenue += agent.totalRevenue;
              existing.jobs += agent.jobsCompleted;
              if (agent.totalRevenue > existing.topRevenue) {
                existing.topName = agent.name;
                existing.topRevenue = agent.totalRevenue;
              }
            } else {
              grouped.set(agent.walletAddress, {
                agents: 1,
                revenue: agent.totalRevenue,
                jobs: agent.jobsCompleted,
                topName: agent.name,
                topRevenue: agent.totalRevenue,
              });
            }
          }

          // Sort by total revenue descending
          const sorted = Array.from(grouped.entries())
            .sort((a, b) => b[1].revenue - a[1].revenue)
            .map(([wallet, info], i) => ({
              rank: i + 1,
              wallet,
              agentCount: info.agents,
              topAgentName: info.topName,
              totalRevenue: info.revenue,
              totalJobs: info.jobs,
            }));

          setCreators(sorted);
        }
      } catch {
        // silently fail
      } finally {
        setLoadingCreators(false);
      }
    }
    fetchCreators();
  }, []);

  const isLoading =
    tab === "users"
      ? loadingUsers
      : tab === "agents"
        ? loadingAgents
        : loadingCreators;

  /* ---------- Tab button style (matches dashboard) ---------- */

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: "inherit",
    fontSize: "14px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    padding: "10px 28px",
    cursor: "pointer",
    border: active ? `1px solid ${BRAND}` : "1px solid rgba(255,255,255,0.2)",
    borderRadius: "6px",
    backgroundColor: active ? "rgba(255,254,178,0.12)" : "transparent",
    color: active ? BRAND : "rgba(255,255,255,0.5)",
    backdropFilter: "blur(4px)",
    transition: "all 0.15s ease",
    fontWeight: active ? 600 : 400,
  });

  /* ---------- Table styles ---------- */

  const headerCellStyle: React.CSSProperties = {
    fontSize: "13px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "rgba(255,255,255,0.35)",
    padding: "14px 16px",
    textAlign: "left",
    borderBottom: "1px solid rgba(255,255,255,0.1)",
    fontWeight: 600,
  };

  const cellStyle: React.CSSProperties = {
    fontSize: "14px",
    color: "rgba(255,255,255,0.8)",
    padding: "14px 16px",
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

  /* ---------- Level badge ---------- */

  const levelBadge = (level: number) => (
    <span
      style={{
        display: "inline-block",
        fontSize: "11px",
        fontWeight: 700,
        letterSpacing: "0.06em",
        color: BRAND,
        backgroundColor: "rgba(255,254,178,0.14)",
        border: `1px solid rgba(255,254,178,0.3)`,
        borderRadius: "999px",
        padding: "2px 10px",
        whiteSpace: "nowrap",
      }}
    >
      LV.{level}
    </span>
  );

  /* ---------- Empty state ---------- */

  const emptyMessage = (
    <div
      style={{
        padding: "60px 16px",
        textAlign: "center",
        fontSize: "14px",
        color: "rgba(255,255,255,0.4)",
      }}
    >
      No data yet
    </div>
  );

  /* ---------- Loading skeleton rows ---------- */

  const loadingRows = (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <LoadingSkeleton width="30px" height="16px" />
          <LoadingSkeleton width="120px" height="16px" />
          <div style={{ flex: 1 }} />
          <LoadingSkeleton width="60px" height="16px" />
          <LoadingSkeleton width="50px" height="16px" />
          <LoadingSkeleton width="70px" height="16px" />
        </div>
      ))}
    </div>
  );

  /* ---------- Render ---------- */

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
          backgroundImage:
            "image-set(url('/poster-bg.webp') type('image/webp'), url('/poster-bg.png') type('image/png'))",
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
      <div
        style={{
          position: "relative",
          zIndex: 2,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <NavBar activeTab="leaderboard" variant="dark" />

        <div style={{ flex: 1, padding: "48px 24px 80px" }}>
          <div style={{ maxWidth: "960px", margin: "0 auto" }}>
            {/* Title */}
            <h1
              style={{
                fontFamily: "var(--font-display, inherit)",
                fontSize: "42px",
                fontWeight: 700,
                color: "#ffffff",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                margin: "0 0 40px 0",
                textAlign: "center",
              }}
            >
              Leaderboard
            </h1>

            {/* Tabs */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "12px",
                marginBottom: "32px",
              }}
            >
              <button
                onClick={() => setTab("users")}
                style={tabBtnStyle(tab === "users")}
              >
                Users
              </button>
              <button
                onClick={() => setTab("agents")}
                style={tabBtnStyle(tab === "agents")}
              >
                Agents
              </button>
              <button
                onClick={() => setTab("creators")}
                style={tabBtnStyle(tab === "creators")}
              >
                Creators
              </button>
            </div>

            {/* Card */}
            <div style={{ ...GLASS_CARD, overflow: "hidden" }}>
              {isLoading ? (
                loadingRows
              ) : tab === "users" ? (
                /* ── Users (XP) Table ── */
                users.length === 0 ? (
                  emptyMessage
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        minWidth: "700px",
                      }}
                    >
                      <thead>
                        <tr>
                          <th style={{ ...headerCellStyle, width: "60px" }}>
                            Rank
                          </th>
                          <th style={headerCellStyle}>Wallet</th>
                          <th
                            style={{
                              ...headerCellStyle,
                              textAlign: "center",
                            }}
                          >
                            Level
                          </th>
                          <th
                            style={{
                              ...headerCellStyle,
                              textAlign: "right",
                            }}
                          >
                            Total XP
                          </th>
                          <th
                            style={{
                              ...headerCellStyle,
                              textAlign: "right",
                            }}
                          >
                            Jobs Done
                          </th>
                          <th
                            style={{
                              ...headerCellStyle,
                              textAlign: "right",
                            }}
                          >
                            Total Earned
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u) => (
                          <tr
                            key={u.wallet}
                            style={{ transition: "background-color 0.15s ease" }}
                            {...rowHoverProps}
                          >
                            {/* Rank */}
                            <td
                              style={{
                                ...cellStyle,
                                fontWeight: 700,
                                color: rankColor(u.rank),
                                fontSize: u.rank <= 3 ? "16px" : "14px",
                              }}
                            >
                              {rankLabel(u.rank)}
                            </td>

                            {/* Wallet */}
                            <td style={cellStyle}>
                              <span
                                style={{
                                  fontFamily: "monospace",
                                  fontSize: "13px",
                                  color:
                                    u.rank <= 3
                                      ? rankColor(u.rank)
                                      : "rgba(255,255,255,0.7)",
                                }}
                              >
                                {u.displayName.length > 20
                                  ? formatAddress(u.displayName)
                                  : u.displayName}
                              </span>
                            </td>

                            {/* Level */}
                            <td
                              style={{
                                ...cellStyle,
                                textAlign: "center",
                              }}
                            >
                              {levelBadge(u.level)}
                            </td>

                            {/* Total XP */}
                            <td
                              style={{
                                ...cellStyle,
                                textAlign: "right",
                                fontWeight: 600,
                                color: BRAND,
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {u.totalXp.toLocaleString()}
                            </td>

                            {/* Jobs Completed */}
                            <td
                              style={{
                                ...cellStyle,
                                textAlign: "right",
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {u.jobsCompleted}
                            </td>

                            {/* Total Earned */}
                            <td
                              style={{
                                ...cellStyle,
                                textAlign: "right",
                              }}
                            >
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "5px",
                                  fontVariantNumeric: "tabular-nums",
                                }}
                              >
                                <img
                                  src={USDC_LOGO_URL}
                                  alt="USDC"
                                  width={14}
                                  height={14}
                                  style={{ borderRadius: "50%" }}
                                />
                                {u.totalEarned.toFixed(2)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : tab === "agents" ? (
                /* ── Agents (ELO) Table ── */
              agents.length === 0 ? (
                emptyMessage
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      minWidth: "700px",
                    }}
                  >
                    <thead>
                      <tr>
                        <th style={{ ...headerCellStyle, width: "60px" }}>
                          Rank
                        </th>
                        <th style={headerCellStyle}>Agent Name</th>
                        <th
                          style={{
                            ...headerCellStyle,
                            textAlign: "right",
                          }}
                        >
                          ELO Rating
                        </th>
                        <th
                          style={{
                            ...headerCellStyle,
                            textAlign: "center",
                          }}
                        >
                          W / L
                        </th>
                        <th
                          style={{
                            ...headerCellStyle,
                            textAlign: "right",
                          }}
                        >
                          Win Rate
                        </th>
                        <th
                          style={{
                            ...headerCellStyle,
                            textAlign: "right",
                          }}
                        >
                          Peak ELO
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {agents.map((a, i) => {
                        const rank = i + 1;
                        const totalGames = a.wins + a.losses + a.draws;
                        const winRate =
                          totalGames > 0
                            ? ((a.wins / totalGames) * 100).toFixed(1)
                            : "0.0";

                        return (
                          <tr
                            key={a.agentWallet}
                            style={{
                              transition: "background-color 0.15s ease",
                            }}
                            {...rowHoverProps}
                          >
                            {/* Rank */}
                            <td
                              style={{
                                ...cellStyle,
                                fontWeight: 700,
                                color: rankColor(rank),
                                fontSize: rank <= 3 ? "16px" : "14px",
                              }}
                            >
                              {rankLabel(rank)}
                            </td>

                            {/* Agent (avatar + name + badge) */}
                            <td style={cellStyle}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                {a.avatarUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={a.avatarUrl}
                                    alt={a.agentName || ""}
                                    style={{
                                      width: 32,
                                      height: 32,
                                      borderRadius: 6,
                                      objectFit: "cover",
                                      flexShrink: 0,
                                      border: "1px solid rgba(255,255,255,0.1)",
                                    }}
                                  />
                                ) : (
                                  <div
                                    style={{
                                      width: 32,
                                      height: 32,
                                      borderRadius: 6,
                                      flexShrink: 0,
                                      background: a.isDefault
                                        ? a.agentWallet ===
                                          (process.env.NEXT_PUBLIC_AGENT_ALPHA_WALLET ||
                                            "7GpXEwNrf8BVFBGMYjuYHoSmN1FvGFQD1MTtgJk2u7fG")
                                          ? "#fffeb220"
                                          : "#FF425E20"
                                        : "rgba(255,255,255,0.06)",
                                      border: `1px solid ${
                                        a.isDefault ? "rgba(255,254,178,0.2)" : "rgba(255,255,255,0.08)"
                                      }`,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontSize: 13,
                                      fontWeight: 800,
                                      color: a.isDefault
                                        ? a.agentWallet ===
                                          (process.env.NEXT_PUBLIC_AGENT_ALPHA_WALLET ||
                                            "7GpXEwNrf8BVFBGMYjuYHoSmN1FvGFQD1MTtgJk2u7fG")
                                          ? "#fffeb2"
                                          : "#FF425E"
                                        : "rgba(255,255,255,0.6)",
                                    }}
                                  >
                                    {(a.agentName || a.agentWallet).charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div style={{ minWidth: 0 }}>
                                  <div
                                    style={{
                                      fontWeight: 600,
                                      color:
                                        rank <= 3
                                          ? rankColor(rank)
                                          : "rgba(255,255,255,0.9)",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 8,
                                    }}
                                  >
                                    {a.agentName || formatAddress(a.agentWallet)}
                                    {a.isDefault && (
                                      <span
                                        style={{
                                          fontSize: 9,
                                          padding: "1px 6px",
                                          borderRadius: 3,
                                          background: "rgba(255,255,255,0.08)",
                                          color: "rgba(255,255,255,0.55)",
                                          fontWeight: 700,
                                          letterSpacing: "0.06em",
                                          textTransform: "uppercase",
                                        }}
                                      >
                                        Default
                                      </span>
                                    )}
                                    {a.isCustom && (
                                      <span
                                        style={{
                                          fontSize: 9,
                                          padding: "1px 6px",
                                          borderRadius: 3,
                                          background: "rgba(124,255,124,0.12)",
                                          color: "#7CFF7C",
                                          fontWeight: 700,
                                          letterSpacing: "0.06em",
                                          textTransform: "uppercase",
                                        }}
                                      >
                                        Community
                                      </span>
                                    )}
                                  </div>
                                  {a.category && (
                                    <div
                                      style={{
                                        fontSize: 10,
                                        color: "rgba(255,255,255,0.3)",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.06em",
                                        marginTop: 2,
                                      }}
                                    >
                                      {a.category.replace(/_/g, " ")}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* ELO Rating */}
                            <td
                              style={{
                                ...cellStyle,
                                textAlign: "right",
                                fontWeight: 700,
                                fontSize: "15px",
                                color: BRAND,
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {a.elo}
                            </td>

                            {/* W / L */}
                            <td
                              style={{
                                ...cellStyle,
                                textAlign: "center",
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              <span style={{ color: "#22c55e" }}>
                                {a.wins}
                              </span>
                              <span
                                style={{
                                  color: "rgba(255,255,255,0.25)",
                                  margin: "0 4px",
                                }}
                              >
                                /
                              </span>
                              <span style={{ color: "#FF425E" }}>
                                {a.losses}
                              </span>
                            </td>

                            {/* Win Rate */}
                            <td
                              style={{
                                ...cellStyle,
                                textAlign: "right",
                                fontVariantNumeric: "tabular-nums",
                                color:
                                  parseFloat(winRate) >= 60
                                    ? "#22c55e"
                                    : parseFloat(winRate) >= 40
                                      ? "rgba(255,255,255,0.7)"
                                      : "#FF425E",
                              }}
                            >
                              {winRate}%
                            </td>

                            {/* Peak ELO */}
                            <td
                              style={{
                                ...cellStyle,
                                textAlign: "right",
                                fontVariantNumeric: "tabular-nums",
                                color: "rgba(255,255,255,0.5)",
                              }}
                            >
                              {a.peakElo}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
              ) : /* ── Creators (Revenue) Table ── */
              creators.length === 0 ? (
                emptyMessage
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      minWidth: "700px",
                    }}
                  >
                    <thead>
                      <tr>
                        <th style={{ ...headerCellStyle, width: "60px" }}>
                          Rank
                        </th>
                        <th style={headerCellStyle}>Creator</th>
                        <th
                          style={{
                            ...headerCellStyle,
                            textAlign: "center",
                          }}
                        >
                          Agents
                        </th>
                        <th style={headerCellStyle}>Top Agent</th>
                        <th
                          style={{
                            ...headerCellStyle,
                            textAlign: "right",
                          }}
                        >
                          Total Revenue
                        </th>
                        <th
                          style={{
                            ...headerCellStyle,
                            textAlign: "right",
                          }}
                        >
                          Total Jobs
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {creators.map((c) => (
                        <tr
                          key={c.wallet}
                          style={{ transition: "background-color 0.15s ease" }}
                          {...rowHoverProps}
                        >
                          {/* Rank */}
                          <td
                            style={{
                              ...cellStyle,
                              fontWeight: 700,
                              color: rankColor(c.rank),
                              fontSize: c.rank <= 3 ? "16px" : "14px",
                            }}
                          >
                            {rankLabel(c.rank)}
                          </td>

                          {/* Creator Wallet */}
                          <td style={cellStyle}>
                            <span
                              style={{
                                fontFamily: "monospace",
                                fontSize: "13px",
                                color:
                                  c.rank <= 3
                                    ? rankColor(c.rank)
                                    : "rgba(255,255,255,0.7)",
                              }}
                            >
                              {formatAddress(c.wallet)}
                            </span>
                          </td>

                          {/* Agent Count */}
                          <td
                            style={{
                              ...cellStyle,
                              textAlign: "center",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {c.agentCount}
                          </td>

                          {/* Top Agent Name */}
                          <td style={cellStyle}>
                            <span
                              style={{
                                fontWeight: 600,
                                color: "rgba(255,255,255,0.85)",
                              }}
                            >
                              {c.topAgentName}
                            </span>
                          </td>

                          {/* Total Revenue */}
                          <td
                            style={{
                              ...cellStyle,
                              textAlign: "right",
                            }}
                          >
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "5px",
                                fontWeight: 600,
                                color: BRAND,
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              <img
                                src={USDC_LOGO_URL}
                                alt="USDC"
                                width={14}
                                height={14}
                                style={{ borderRadius: "50%" }}
                              />
                              {c.totalRevenue.toFixed(2)}
                            </span>
                          </td>

                          {/* Total Jobs */}
                          <td
                            style={{
                              ...cellStyle,
                              textAlign: "right",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {c.totalJobs}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
