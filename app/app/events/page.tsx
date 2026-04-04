"use client";

import { useState, useEffect } from "react";
import NavBar from "@/components/NavBar";
import EmptyState from "@/components/EmptyState";
import { SOL_LOGO_URL } from "@/lib/constants";

interface EventItem {
  timestamp: string;
  type: string;
  description: string;
  wallets: string[];
  amount: number | null;
  txHash: string | null;
}

function formatTs(dateStr: string): string {
  const d = new Date(dateStr);
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${mo}-${da} ${h}:${mi}:${s}`;
}

function typeBadgeColor(type: string): { bg: string; border: string; text: string } {
  if (type.includes("create") || type === "job_created") return { bg: "rgba(59,130,246,0.15)", border: "rgba(59,130,246,0.3)", text: "#93c5fd" };
  if (type.includes("accept")) return { bg: "rgba(253,230,138,0.15)", border: "rgba(253,230,138,0.3)", text: "#42BDFF" };
  if (type.includes("submit") || type === "submission") return { bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.3)", text: "#FFE342" };
  if (type.includes("cancel")) return { bg: "rgba(252,165,165,0.15)", border: "rgba(252,165,165,0.3)", text: "#fca5a5" };
  return { bg: "rgba(255,255,255,0.08)", border: "rgba(255,255,255,0.15)", text: "rgba(255,255,255,0.6)" };
}

export default function EventsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchEvents() {
      try {
        const res = await fetch("/api/events");
        if (res.ok) {
          const data = await res.json();
          setEvents(data.events || []);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchEvents();
    const interval = setInterval(fetchEvents, 10000);
    return () => clearInterval(interval);
  }, []);

  const glassCard: React.CSSProperties = {
    backgroundColor: "rgba(255,255,255,0.07)",
    backdropFilter: "blur(16px)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "10px",
    padding: "24px",
  };

  return (
    <div style={{ minHeight: "100vh", fontFamily: "inherit", position: "relative" }}>
      {/* Background */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "url('/poster-bg.png')", backgroundSize: "cover", backgroundPosition: "center" }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 1, backgroundColor: "rgba(0,0,0,0.6)" }} />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 2 }}>
        <NavBar activeTab="events" variant="dark" />

        <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "32px 24px" }}>
          <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: "-0.01em", margin: "0 0 4px 0" }}>
            Event Log
          </h1>
          <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", margin: "0 0 24px 0" }}>
            Chronological feed of all protocol activity. Auto-refreshes every 10s.
          </p>

          <div style={glassCard}>
            {loading ? (
              <div style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", padding: "40px 0" }}>Loading events...</div>
            ) : events.length === 0 ? (
              <EmptyState
                title="No Events Yet"
                subtitle="Protocol activity will appear here as jobs are created and completed."
                type="history"
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
                {events.map((ev, i) => {
                  const badge = typeBadgeColor(ev.type);
                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "12px 0",
                        borderBottom: i < events.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                        flexWrap: "wrap",
                      }}
                    >
                      {/* Timestamp */}
                      <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", fontVariantNumeric: "tabular-nums", minWidth: "90px", flexShrink: 0 }}>
                        {formatTs(ev.timestamp)}
                      </span>

                      {/* Type badge */}
                      <span
                        style={{
                          fontSize: "9px",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: "4px",
                          backgroundColor: badge.bg,
                          border: `1px solid ${badge.border}`,
                          color: badge.text,
                          minWidth: "80px",
                          textAlign: "center",
                          flexShrink: 0,
                        }}
                      >
                        {ev.type.replace(/_/g, " ")}
                      </span>

                      {/* Description */}
                      <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.8)", flex: 1, minWidth: 0 }}>
                        {ev.description}
                      </span>

                      {/* Wallets */}
                      <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", fontFamily: "monospace", flexShrink: 0 }}>
                        {ev.wallets.map((w) => w.slice(0, 4) + "..." + w.slice(-4)).join(", ")}
                      </span>

                      {/* Amount */}
                      {ev.amount !== null && (
                        <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)", fontFamily: "monospace", flexShrink: 0 }}>
                          {ev.amount} USDC
                        </span>
                      )}

                      {/* TX Hash */}
                      {ev.txHash && (
                        <a
                          href={`https://explorer.solana.com/tx/${ev.txHash}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: "9px",
                            color: "#5ba4f5",
                            textDecoration: "none",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            flexShrink: 0,
                          }}
                        >
                          <img src={SOL_LOGO_URL} alt="SOL" width={10} height={10} style={{ borderRadius: "50%" }} />
                          {ev.txHash.slice(0, 8)}...
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
