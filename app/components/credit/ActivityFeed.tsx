"use client";

/**
 * Live activity feed for /credit — shows recent list / buy / settle /
 * cancel events from the claim marketplace. Polls /api/claims/activity
 * every 3s and animates new rows in.
 *
 * Designed as a sticky sidebar on desktop / collapsible panel on mobile.
 */

import { useEffect, useRef, useState } from "react";
import { SolscanLink, shortWallet } from "./CreditHelpers";

interface ActivityEvent {
  type: "listed" | "bought" | "settled" | "cancelled";
  at: string;
  claimId: string;
  jobId: string;
  jobTitle: string;
  category: string;
  amount: number;
  price?: number;
  sellerWallet: string;
  buyerWallet: string | null;
  txHash: string | null;
}

const TYPE_STYLE: Record<ActivityEvent["type"], { label: string; color: string }> = {
  listed: { label: "LISTED", color: "#fffeb2" },
  bought: { label: "BOUGHT", color: "#7CFF7C" },
  settled: { label: "SETTLED", color: "#4DA6FF" },
  cancelled: { label: "CANCELLED", color: "#888" },
};

function timeAgo(iso: string): string {
  const diff = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

export default function ActivityFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const res = await fetch("/api/claims/activity?limit=30");
        if (!res.ok) return;
        const json = await res.json();
        if (alive) {
          setEvents(json.events ?? []);
          setLoading(false);
          for (const e of json.events ?? []) {
            seen.current.add(`${e.claimId}:${e.type}`);
          }
        }
      } catch {
        /* ignore */
      }
    }
    tick();
    const iv = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        padding: "14px 16px",
        maxHeight: 560,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <div
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "rgba(255,255,255,0.6)",
            fontWeight: 700,
          }}
        >
          Live activity
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 10,
            color: "rgba(255,255,255,0.4)",
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#7CFF7C",
              boxShadow: "0 0 6px #7CFF7C",
            }}
          />
          Live
        </div>
      </div>

      <div style={{ overflowY: "auto", flex: 1, marginRight: -8, paddingRight: 8 }}>
        {loading ? (
          <div
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.3)",
              padding: "24px 0",
              textAlign: "center",
            }}
          >
            Listening…
          </div>
        ) : events.length === 0 ? (
          <div
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.3)",
              padding: "24px 0",
              textAlign: "center",
            }}
          >
            No activity yet. Be the first to list a claim.
          </div>
        ) : (
          events.map((e) => {
            const style = TYPE_STYLE[e.type];
            return (
              <div
                key={`${e.claimId}:${e.type}`}
                style={{
                  padding: "10px 0",
                  borderTop: "1px solid rgba(255,255,255,0.05)",
                  fontSize: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      letterSpacing: "0.1em",
                      color: style.color,
                      padding: "1px 6px",
                      borderRadius: 3,
                      background: `${style.color}18`,
                    }}
                  >
                    {style.label}
                  </span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
                    {timeAgo(e.at)}
                  </span>
                  {e.txHash && !e.txHash.startsWith("agent:") && !e.txHash.startsWith("local:") && (
                    <span style={{ marginLeft: "auto" }}>
                      <SolscanLink value={e.txHash} kind="tx" label="tx" />
                    </span>
                  )}
                </div>
                <div style={{ color: "rgba(255,255,255,0.85)", lineHeight: 1.4 }}>
                  {e.type === "listed" && (
                    <>
                      <b>{shortWallet(e.sellerWallet)}</b> listed{" "}
                      <b style={{ color: "#fffeb2" }}>{e.amount.toFixed(2)} USDC</b>{" "}
                      claim @ {e.price?.toFixed(2)}
                    </>
                  )}
                  {e.type === "bought" && (
                    <>
                      <b>{shortWallet(e.buyerWallet ?? "?")}</b> bought{" "}
                      <b style={{ color: "#fffeb2" }}>{e.amount.toFixed(2)} USDC</b>{" "}
                      claim for {e.price?.toFixed(2)}
                    </>
                  )}
                  {e.type === "settled" && (
                    <>
                      Settlement →{" "}
                      <b style={{ color: "#7CFF7C" }}>
                        {e.amount.toFixed(2)} USDC
                      </b>{" "}
                      paid to {shortWallet(e.buyerWallet ?? "?")}
                    </>
                  )}
                  {e.type === "cancelled" && (
                    <>
                      <b>{shortWallet(e.sellerWallet)}</b> cancelled listing
                    </>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.3)",
                    marginTop: 3,
                  }}
                >
                  {e.jobTitle} · {e.category}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
