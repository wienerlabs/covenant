"use client";

/**
 * Covenant Credit — real-time visualizer.
 *
 * One-glance dashboard that tells the protocol story: how much claim
 * paper is live, what it's priced at, how fast it's moving. Intended
 * as a Twitter-shareable artifact during the hackathon.
 *
 * All charts are pure SVG (no charting library) — keeps the bundle
 * small and the demo dependency-free.
 */

import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";

interface StatsResponse {
  now: number;
  bucketHours: number;
  totals: {
    activeListings: number;
    activeTvl: number;
    boughtCount: number;
    settledCount: number;
    cancelledCount: number;
  };
  apr: {
    median: number;
    p90: number;
    distribution: number[];
  };
  series: {
    tvlCumulative: number[];
    boughtPerHour: number[];
    settledPerHour: number[];
    volumePerHour: number[];
  };
}

function Sparkline({
  values,
  width = 560,
  height = 80,
  stroke = "#fffeb2",
  fill = "rgba(255,254,178,0.1)",
}: {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
}) {
  if (values.length === 0) {
    return (
      <div
        style={{ width, height, color: "rgba(255,255,255,0.3)", fontSize: 11 }}
      >
        no data
      </div>
    );
  }

  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const range = max - min || 1;
  const step = width / Math.max(1, values.length - 1);

  const toY = (v: number) =>
    height - ((v - min) / range) * height * 0.9 - height * 0.05;

  const linePath = values
    .map((v, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(2)} ${toY(v).toFixed(2)}`)
    .join(" ");

  const areaPath =
    linePath +
    ` L ${(values.length - 1) * step} ${height} L 0 ${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: "block" }}
    >
      <path d={areaPath} fill={fill} stroke="none" />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.5} />
    </svg>
  );
}

function Histogram({
  values,
  buckets = 20,
  width = 560,
  height = 80,
  stroke = "#7CFF7C",
}: {
  values: number[];
  buckets?: number;
  width?: number;
  height?: number;
  stroke?: string;
}) {
  if (values.length === 0) {
    return (
      <div
        style={{ width, height, color: "rgba(255,255,255,0.3)", fontSize: 11 }}
      >
        no claims yet
      </div>
    );
  }

  const capped = values.map((v) => Math.min(1500, v));
  const max = Math.max(100, ...capped);
  const bucketWidth = max / buckets;
  const histogram = new Array<number>(buckets).fill(0);
  for (const v of capped) {
    const b = Math.min(buckets - 1, Math.floor(v / bucketWidth));
    histogram[b] += 1;
  }
  const maxCount = Math.max(1, ...histogram);

  const barWidth = width / buckets;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {histogram.map((count, i) => {
        const h = (count / maxCount) * (height - 4);
        return (
          <rect
            key={i}
            x={i * barWidth + 1}
            y={height - h}
            width={barWidth - 2}
            height={h}
            fill={stroke}
            opacity={0.8}
          />
        );
      })}
    </svg>
  );
}

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export default function CreditDashboardPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const res = await fetch("/api/claims/stats");
        if (!res.ok) return;
        const json = await res.json();
        if (alive) {
          setStats(json);
          setLoading(false);
        }
      } catch {
        /* ignore */
      }
    }
    tick();
    const iv = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#0b0b0b", color: "#fff", fontFamily: "inherit" }}>
      <NavBar activeTab="credit" variant="dark" />

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px 80px" }}>
        <div style={{ marginBottom: 32 }}>
          <div
            style={{
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: "#fffeb2",
              marginBottom: 8,
            }}
          >
            Covenant Credit — Live Visualizer
          </div>
          <div style={{ fontSize: 34, fontWeight: 800, marginBottom: 8 }}>
            Agent paper is flowing.
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
            Updated every 5 seconds · 7-day rolling window
          </div>
        </div>

        {/* Hero stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 12,
            marginBottom: 40,
          }}
        >
          <Tile
            label="Active TVL"
            value={stats ? formatMoney(stats.totals.activeTvl) : "—"}
            accent="#fffeb2"
          />
          <Tile
            label="Active listings"
            value={stats ? String(stats.totals.activeListings) : "—"}
          />
          <Tile
            label="Bought"
            value={stats ? String(stats.totals.boughtCount) : "—"}
            accent="#7CFF7C"
          />
          <Tile
            label="Settled"
            value={stats ? String(stats.totals.settledCount) : "—"}
            accent="#7CFF7C"
          />
          <Tile
            label="Median APR"
            value={stats ? `${Math.round(stats.apr.median)}%` : "—"}
            accent="#7CFF7C"
          />
        </div>

        {/* Sparklines */}
        <ChartCard title="TVL listed (cumulative, 7d)">
          <Sparkline values={stats?.series.tvlCumulative ?? []} />
        </ChartCard>

        <ChartCard title="Claims bought per hour">
          <Sparkline
            values={stats?.series.boughtPerHour ?? []}
            stroke="#7CFF7C"
            fill="rgba(124,255,124,0.08)"
          />
        </ChartCard>

        <ChartCard title="Claims settled per hour (routed to buyers)">
          <Sparkline
            values={stats?.series.settledPerHour ?? []}
            stroke="#4DA6FF"
            fill="rgba(77,166,255,0.08)"
          />
        </ChartCard>

        <ChartCard title="Buy volume per hour (USDC flowing to sellers)">
          <Sparkline
            values={stats?.series.volumePerHour ?? []}
            stroke="#FFB84D"
            fill="rgba(255,184,77,0.08)"
          />
        </ChartCard>

        <ChartCard
          title={`APR distribution across active listings (median ${
            stats ? Math.round(stats.apr.median) : 0
          }% · p90 ${stats ? Math.round(stats.apr.p90) : 0}%)`}
        >
          <Histogram values={stats?.apr.distribution ?? []} />
        </ChartCard>

        <div
          style={{
            marginTop: 40,
            padding: 20,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 10,
            fontSize: 12,
            color: "rgba(255,255,255,0.5)",
            lineHeight: 1.6,
          }}
        >
          {loading
            ? "Loading stats…"
            : "All data is computed from on-chain ClaimListing PDAs mirrored into the DB. Chain is the source of truth; this dashboard is a denormalized view."}
        </div>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        padding: "16px 18px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "rgba(255,255,255,0.45)",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent ?? "#fff" }}>
        {value}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 10,
        padding: "16px 20px",
        marginBottom: 16,
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "rgba(255,255,255,0.5)",
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      <div style={{ overflowX: "auto" }}>{children}</div>
    </div>
  );
}
