"use client";

/**
 * Top lenders widget for /credit — compact leaderboard showing who's
 * deploying the most capital into the claim marketplace. Social proof
 * for "people are actually doing this."
 */

import { useEffect, useState } from "react";
import { shortWallet } from "./CreditHelpers";

interface Leader {
  wallet: string;
  claimsBought: number;
  usdcSpent: number;
  usdcFaceValue: number;
  grossYield: number;
  settledCount: number;
}

export default function LeaderboardWidget() {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [distinct, setDistinct] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const res = await fetch("/api/claims/leaderboard?limit=5&window=7d");
        if (!res.ok) return;
        const json = await res.json();
        if (alive) {
          setLeaders(json.leaders ?? []);
          setDistinct(json.totals?.distinctLenders ?? 0);
          setLoading(false);
        }
      } catch {
        /* ignore */
      }
    }
    tick();
    const iv = setInterval(tick, 15_000);
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
          Top lenders · 7d
        </div>
        {distinct > 0 && (
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
            {distinct} total
          </div>
        )}
      </div>

      {loading ? (
        <div
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.3)",
            padding: "16px 0",
            textAlign: "center",
          }}
        >
          Loading…
        </div>
      ) : leaders.length === 0 ? (
        <div
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.3)",
            padding: "16px 0",
            textAlign: "center",
          }}
        >
          No purchases yet this week.
        </div>
      ) : (
        leaders.map((l, i) => (
          <div
            key={l.wallet}
            style={{
              display: "grid",
              gridTemplateColumns: "22px 1fr auto",
              gap: 8,
              alignItems: "center",
              padding: "8px 0",
              borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none",
              fontSize: 12,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                color:
                  i === 0
                    ? "#FFEC70"
                    : i === 1
                      ? "#C9C9C9"
                      : i === 2
                        ? "#B08D57"
                        : "rgba(255,255,255,0.4)",
              }}
            >
              #{i + 1}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>
                {shortWallet(l.wallet)}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                {l.claimsBought} claim{l.claimsBought !== 1 ? "s" : ""} ·{" "}
                {l.settledCount} settled
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#7CFF7C" }}>
                ${l.grossYield.toFixed(2)}
              </div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>
                from ${l.usdcSpent.toFixed(0)}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
