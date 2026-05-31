"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import ChallengeCountdown from "@/components/ChallengeCountdown";

/* ------------------------------------------------------------------ */
/*  Types (mirror /api/settlement/stats)                               */
/* ------------------------------------------------------------------ */

interface BucketCounts {
  Open: number;
  Accepted: number;
  Delivered: number;
  Finalized: number;
  Disputed: number;
  Resolved: number;
  Cancelled: number;
}

interface InChallengeJob {
  id: string;
  pda: string | null;
  amount: number;
  paymentToken: string;
  category: string;
  posterWallet: string;
  takerWallet: string | null;
  challengeEndAt: string | null;
  deliveredAt: string | null;
  txHash: string | null;
  title: string | null;
}

interface RecentSettlement {
  id: string;
  pda: string | null;
  amount: number;
  paymentToken: string;
  category: string;
  status: string;
  finalizedAt: string;
  txHash: string | null;
  outcome: "auto_release" | "resolved";
}

interface VolumePoint {
  date: string;
  usdc: number;
  count: number;
}

interface CategoryStat {
  category: string;
  settledCount: number;
  settledUsdc: number;
  lockedUsdc: number;
}

interface HeatCell {
  dow: number;
  hour: number;
  count: number;
}

interface TopEarner {
  wallet: string;
  earnedUsdc: number;
  jobsCompleted: number;
}

interface NetworkEdge {
  poster: string;
  taker: string;
  amount: number;
  category: string;
}

interface SettlementStats {
  bucketCounts: BucketCounts;
  totalSettledUsdc: number;
  totalEscrowLockedUsdc: number;
  autoReleaseRate: number;
  disputeRate: number;
  avgSettlementSeconds: number;
  protocolFeeUsdc: number;
  inChallengeNow: number;
  inChallengeJobs: InChallengeJob[];
  recentSettlements: RecentSettlement[];
  volumeSeries: VolumePoint[];
  categoryBreakdown: CategoryStat[];
  heatmap: HeatCell[];
  topEarners: TopEarner[];
  networkEdges: NetworkEdge[];
}

/* ------------------------------------------------------------------ */
/*  Constants + helpers                                                 */
/* ------------------------------------------------------------------ */

const ACCENT = "#fffeb2";
const SOLSCAN_TX = (h: string): string =>
  `https://solscan.io/tx/${h}?cluster=devnet`;

const CATEGORY_COLOR: Record<string, string> = {
  text_writing: "#fffeb2",
  code_review: "#a855f7",
  translation: "#38bdf8",
  data_labeling: "#22c55e",
  bug_bounty: "#ef4444",
  design: "#f59e0b",
  solana_agent: "#14f195",
};
const colorFor = (c: string): string => CATEGORY_COLOR[c] ?? "#9ca3af";

function usd(v: number): string {
  if (!Number.isFinite(v)) return "$0";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v.toFixed(2)}`;
}
function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}
function dur(s: number): string {
  if (!Number.isFinite(s) || s <= 0) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86_400) return `${(s / 3600).toFixed(1)}h`;
  return `${(s / 86_400).toFixed(1)}d`;
}
function shortWallet(w: string | null): string {
  if (!w) return "—";
  return `${w.slice(0, 4)}…${w.slice(-4)}`;
}
function timeAgo(iso: string): string {
  const d = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (d < 60) return `${Math.round(d)}s ago`;
  if (d < 3600) return `${Math.round(d / 60)}m ago`;
  if (d < 86_400) return `${Math.round(d / 3600)}h ago`;
  return `${Math.round(d / 86_400)}d ago`;
}

const card: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "12px",
  backgroundColor: "rgba(255,255,255,0.04)",
  backdropFilter: "blur(16px)",
  padding: "20px",
};
const label: React.CSSProperties = {
  fontSize: "10px",
  textTransform: "uppercase",
  letterSpacing: "0.14em",
  color: "rgba(255,255,255,0.45)",
  fontWeight: 600,
};

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function SettlementPage() {
  const [stats, setStats] = useState<SettlementStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/settlement/stats", { cache: "no-store" });
        const data = (await res.json()) as SettlementStats;
        if (!cancelled) {
          setStats(data);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const t = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const totalJobs = useMemo(() => {
    if (!stats) return 0;
    return Object.values(stats.bucketCounts).reduce((a, b) => a + b, 0);
  }, [stats]);

  return (
    <div style={{ minHeight: "100vh", fontFamily: "inherit", position: "relative" }}>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          background:
            "linear-gradient(145deg, #0a0a1a 0%, #0d0620 30%, #130a2e 60%, #0a0a1a 100%)",
        }}
      />
      <div style={{ position: "fixed", inset: 0, zIndex: 1, backgroundColor: "rgba(0,0,0,0.32)" }} />

      <div style={{ position: "relative", zIndex: 2 }}>
        <NavBar activeTab="settlement" variant="dark" />

        {/* Live ticker strip */}
        <SettlementTicker items={stats?.recentSettlements ?? []} />

        <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "28px 20px 96px" }}>
          {/* Hero line */}
          <div style={{ marginBottom: "24px" }}>
            <div
              style={{
                fontSize: "10px",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(255,254,178,0.7)",
                marginBottom: "8px",
                fontWeight: 600,
              }}
            >
              Live · Solana Devnet · Settlement Terminal
            </div>
            <h1
              style={{
                fontSize: "30px",
                fontWeight: 800,
                color: "#fff",
                letterSpacing: "0.01em",
                margin: 0,
              }}
            >
              The settlement layer, in real time.
            </h1>
            <p style={{ fontSize: "12px", color: "rgba(255,254,178,0.6)", fontStyle: "italic", marginTop: "8px" }}>
              x402 powers paid access. Covenant powers paid work.
            </p>
          </div>

          {/* Stat cards row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: "12px",
              marginBottom: "16px",
            }}
          >
            <Stat label="Settled volume" value={loading ? "—" : usd(stats?.totalSettledUsdc ?? 0)} sub="USDC released" accent="#22c55e" />
            <Stat label="In escrow now" value={loading ? "—" : usd(stats?.totalEscrowLockedUsdc ?? 0)} sub="Locked across jobs" accent={ACCENT} />
            <Stat label="Auto-release" value={loading ? "—" : pct(stats?.autoReleaseRate ?? 0)} sub={`Dispute ${stats ? pct(stats.disputeRate) : "—"}`} accent="#a855f7" />
            <Stat label="Avg settle" value={loading ? "—" : dur(stats?.avgSettlementSeconds ?? 0)} sub="Delivered → final" accent="#38bdf8" />
            <Stat label="Protocol fee" value={loading ? "—" : usd(stats?.protocolFeeUsdc ?? 0)} sub="20 bps accrued" accent="#14f195" />
          </div>

          {/* Top grid: volume chart (wide) + TVL gauge/donut */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.6fr 1fr",
              gap: "16px",
              marginBottom: "16px",
            }}
          >
            <VolumeChart series={stats?.volumeSeries ?? []} loading={loading} />
            <TvlPanel
              locked={stats?.totalEscrowLockedUsdc ?? 0}
              categories={stats?.categoryBreakdown ?? []}
              loading={loading}
            />
          </div>

          {/* Lifecycle flow */}
          <div style={{ marginBottom: "16px" }}>
            <LifecycleFlow buckets={stats?.bucketCounts ?? null} total={totalJobs} />
          </div>

          {/* Challenge timeline board (departures-board) */}
          <div style={{ marginBottom: "16px" }}>
            <ChallengeTimeline jobs={stats?.inChallengeJobs ?? []} loading={loading} />
          </div>

          {/* Activity heatmap */}
          <div style={{ marginBottom: "16px" }}>
            <ActivityHeatmap cells={stats?.heatmap ?? []} loading={loading} />
          </div>

          {/* Category bars + top earners */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.3fr 1fr",
              gap: "16px",
              marginBottom: "16px",
            }}
          >
            <CategoryBars categories={stats?.categoryBreakdown ?? []} loading={loading} />
            <TopEarners earners={stats?.topEarners ?? []} loading={loading} />
          </div>

          {/* Bottom grid: challenge window + recent settlements */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "16px",
            }}
          >
            <ChallengePanel jobs={stats?.inChallengeJobs ?? []} count={stats?.inChallengeNow ?? 0} loading={loading} />
            <RecentPanel items={stats?.recentSettlements ?? []} loading={loading} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Live ticker                                                        */
/* ------------------------------------------------------------------ */

function SettlementTicker({ items }: { items: RecentSettlement[] }) {
  const row = items.length > 0 ? items : null;
  return (
    <div
      style={{
        borderTop: "1px solid rgba(255,254,178,0.15)",
        borderBottom: "1px solid rgba(255,254,178,0.15)",
        backgroundColor: "rgba(255,254,178,0.04)",
        overflow: "hidden",
        whiteSpace: "nowrap",
        position: "relative",
        height: "34px",
        display: "flex",
        alignItems: "center",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "32px",
          paddingLeft: "16px",
          animation: row ? "covenant-ticker 40s linear infinite" : undefined,
          willChange: "transform",
        }}
      >
        {(row ? [...row, ...row] : []).map((s, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "11px", fontFamily: "monospace" }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: s.outcome === "auto_release" ? "#22c55e" : "#a855f7", display: "inline-block" }} />
            <span style={{ color: "rgba(255,255,255,0.55)" }}>{s.category}</span>
            <span style={{ color: ACCENT, fontWeight: 700 }}>
              {s.paymentToken === "USDC" ? `$${s.amount.toFixed(2)}` : `${s.amount} ${s.paymentToken}`}
            </span>
            <span style={{ color: "rgba(255,255,255,0.35)" }}>{s.outcome === "auto_release" ? "auto-released" : "multisig"}</span>
            <span style={{ color: "rgba(255,255,255,0.3)" }}>{timeAgo(s.finalizedAt)}</span>
            {s.txHash && (
              <a href={SOLSCAN_TX(s.txHash)} target="_blank" rel="noopener noreferrer" style={{ color: "rgba(56,189,248,0.9)", textDecoration: "none" }}>tx↗</a>
            )}
          </span>
        ))}
        {!row && (
          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", fontFamily: "monospace" }}>
            Waiting for settlements on Solana devnet...
          </span>
        )}
      </div>
      <style jsx>{`
        @keyframes covenant-ticker {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat card                                                          */
/* ------------------------------------------------------------------ */

function Stat({ label: l, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div style={{ ...card, padding: "16px", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: "28px", height: "2px", backgroundColor: accent }} />
      <div style={{ ...label, marginBottom: "8px" }}>{l}</div>
      <div style={{ fontSize: "22px", fontWeight: 800, color: "#fff", marginBottom: "4px" }}>{value}</div>
      <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>{sub}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Volume chart (inline SVG area)                                     */
/* ------------------------------------------------------------------ */

function VolumeChart({ series, loading }: { series: VolumePoint[]; loading: boolean }) {
  const W = 640;
  const H = 220;
  const pad = { top: 20, right: 16, bottom: 28, left: 44 };
  const iw = W - pad.left - pad.right;
  const ih = H - pad.top - pad.bottom;

  const data = series.length > 0 ? series : [];
  const maxV = Math.max(1, ...data.map((d) => d.usdc));
  const stepX = data.length > 1 ? iw / (data.length - 1) : iw;

  const points = data.map((d, i) => {
    const x = pad.left + (data.length === 1 ? iw / 2 : i * stepX);
    const y = pad.top + ih - (d.usdc / maxV) * ih;
    return { x, y, d };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath =
    points.length > 0
      ? `${linePath} L${points[points.length - 1].x.toFixed(1)},${(pad.top + ih).toFixed(1)} L${points[0].x.toFixed(1)},${(pad.top + ih).toFixed(1)} Z`
      : "";

  const totalSettled = data.reduce((a, b) => a + b.usdc, 0);

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "10px" }}>
        <div style={label}>Settled volume · 14 days</div>
        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>
          total <strong style={{ color: ACCENT }}>{usd(totalSettled)}</strong>
        </div>
      </div>
      {loading || data.length === 0 ? (
        <div style={{ height: H, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", color: "rgba(255,255,255,0.35)" }}>
          {loading ? "Loading volume..." : "No settled volume yet on this cluster."}
        </div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
          <defs>
            <linearGradient id="volFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity="0.35" />
              <stop offset="100%" stopColor={ACCENT} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {/* gridlines */}
          {[0, 0.25, 0.5, 0.75, 1].map((g) => {
            const y = pad.top + ih - g * ih;
            return (
              <g key={g}>
                <line x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                <text x={pad.left - 8} y={y + 3} textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.35)">
                  {usd(g * maxV)}
                </text>
              </g>
            );
          })}
          {areaPath && <path d={areaPath} fill="url(#volFill)" />}
          {linePath && <path d={linePath} fill="none" stroke={ACCENT} strokeWidth="2" />}
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={ACCENT} />
          ))}
          {/* x labels: first, mid, last */}
          {points.length > 0 &&
            [0, Math.floor(points.length / 2), points.length - 1]
              .filter((v, idx, arr) => arr.indexOf(v) === idx)
              .map((idx) => {
                const p = points[idx];
                const dt = new Date(p.d.date);
                return (
                  <text key={idx} x={p.x} y={H - 10} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.4)">
                    {dt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </text>
                );
              })}
        </svg>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  TVL gauge + category donut                                         */
/* ------------------------------------------------------------------ */

function TvlPanel({ locked, categories, loading }: { locked: number; categories: CategoryStat[]; loading: boolean }) {
  const settledCats = categories.filter((c) => c.settledUsdc > 0).sort((a, b) => b.settledUsdc - a.settledUsdc);
  const totalSettled = settledCats.reduce((a, b) => a + b.settledUsdc, 0) || 1;

  // donut segments
  let acc = 0;
  const R = 52;
  const C = 2 * Math.PI * R;
  const segments = settledCats.map((c) => {
    const frac = c.settledUsdc / totalSettled;
    const seg = { c, frac, offset: acc };
    acc += frac;
    return seg;
  });

  return (
    <div style={card}>
      <div style={{ ...label, marginBottom: "12px" }}>Escrow locked · by category</div>
      {loading ? (
        <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", color: "rgba(255,255,255,0.35)" }}>
          Loading...
        </div>
      ) : (
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          <svg width="140" height="140" viewBox="0 0 140 140">
            <circle cx="70" cy="70" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="14" />
            {segments.map((s, i) => (
              <circle
                key={i}
                cx="70"
                cy="70"
                r={R}
                fill="none"
                stroke={colorFor(s.c.category)}
                strokeWidth="14"
                strokeDasharray={`${s.frac * C} ${C}`}
                strokeDashoffset={-s.offset * C}
                transform="rotate(-90 70 70)"
                strokeLinecap="butt"
              />
            ))}
            <text x="70" y="66" textAnchor="middle" fontSize="16" fontWeight="800" fill="#fff">
              {usd(locked)}
            </text>
            <text x="70" y="82" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.45)" style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}>
              in escrow
            </text>
          </svg>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 }}>
            {settledCats.slice(0, 6).map((c) => (
              <div key={c.category} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "10px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "2px", backgroundColor: colorFor(c.category), flexShrink: 0 }} />
                <span style={{ color: "rgba(255,255,255,0.7)", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.category}</span>
                <span style={{ color: ACCENT, fontWeight: 600 }}>{usd(c.settledUsdc)}</span>
              </div>
            ))}
            {settledCats.length === 0 && (
              <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)" }}>No category volume yet.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Lifecycle flow                                                     */
/* ------------------------------------------------------------------ */

const FLOW_STAGES: { key: keyof BucketCounts; label: string; accent: string }[] = [
  { key: "Open", label: "Open", accent: "rgba(255,254,178,0.6)" },
  { key: "Accepted", label: "Accepted", accent: "rgba(168,85,247,0.7)" },
  { key: "Delivered", label: "Delivered", accent: "rgba(56,189,248,0.7)" },
  { key: "Finalized", label: "Finalized", accent: "rgba(34,197,94,0.7)" },
  { key: "Resolved", label: "Resolved", accent: "rgba(34,197,94,0.45)" },
  { key: "Disputed", label: "Disputed", accent: "rgba(239,68,68,0.6)" },
];

function LifecycleFlow({ buckets, total }: { buckets: BucketCounts | null; total: number }) {
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "16px" }}>
        <div style={label}>Lifecycle flow</div>
        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>
          {total} jobs through the protocol
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "stretch", gap: "0" }}>
        {FLOW_STAGES.map((stage, i) => {
          const count = buckets?.[stage.key] ?? 0;
          return (
            <div key={stage.key} style={{ display: "flex", alignItems: "center", flex: 1 }}>
              <div
                style={{
                  flex: 1,
                  padding: "16px 10px",
                  borderRadius: "10px",
                  border: `1px solid ${stage.accent}`,
                  backgroundColor: "rgba(0,0,0,0.25)",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "26px", fontWeight: 800, color: "#fff" }}>{count}</div>
                <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.5)", marginTop: "4px" }}>
                  {stage.label}
                </div>
              </div>
              {i < FLOW_STAGES.length - 1 && (
                <div style={{ padding: "0 6px", color: "rgba(255,255,255,0.25)", fontSize: "16px" }}>{"→"}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Challenge window panel                                             */
/* ------------------------------------------------------------------ */

function ChallengePanel({ jobs, count, loading }: { jobs: InChallengeJob[]; count: number; loading: boolean }) {
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
        <div style={label}>In challenge window now</div>
        <div style={{ fontSize: "11px", color: "rgba(56,189,248,0.9)", fontWeight: 600 }}>{count} live</div>
      </div>
      {loading ? (
        <Skeleton rows={4} />
      ) : jobs.length === 0 ? (
        <Empty text="No jobs in the challenge window right now." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {jobs.map((job) => {
            const endAt = job.challengeEndAt ? new Date(job.challengeEndAt).getTime() : 0;
            return (
              <Link
                key={job.id}
                href={`/job/${job.id}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.3fr 0.8fr 1fr",
                  gap: "10px",
                  alignItems: "center",
                  padding: "10px 12px",
                  backgroundColor: "rgba(56,189,248,0.06)",
                  border: "1px solid rgba(56,189,248,0.2)",
                  borderRadius: "8px",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "11px", color: "#fff", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {job.title ?? job.category}
                  </div>
                  <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.4)", fontFamily: "monospace" }}>
                    {job.pda ? `${job.pda.slice(0, 6)}…${job.pda.slice(-4)}` : job.id.slice(0, 10)}
                  </div>
                </div>
                <div style={{ fontSize: "12px", color: ACCENT, fontWeight: 700 }}>
                  {job.paymentToken === "USDC" ? `$${job.amount.toFixed(2)}` : `${job.amount} ${job.paymentToken}`}
                </div>
                <div style={{ textAlign: "right" }}>
                  {endAt > 0 && <ChallengeCountdown endAt={endAt} variant="dark" label="Auto-release in" />}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Recent settlements panel                                           */
/* ------------------------------------------------------------------ */

function RecentPanel({ items, loading }: { items: RecentSettlement[]; loading: boolean }) {
  return (
    <div style={card}>
      <div style={{ ...label, marginBottom: "14px" }}>Recent settlements</div>
      {loading ? (
        <Skeleton rows={4} />
      ) : items.length === 0 ? (
        <Empty text="No settled jobs yet on this cluster." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {items.map((s) => {
            const auto = s.outcome === "auto_release";
            return (
              <div
                key={s.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 0.6fr 0.8fr 0.5fr",
                  gap: "10px",
                  alignItems: "center",
                  padding: "9px 12px",
                  backgroundColor: "rgba(255,255,255,0.03)",
                  border: `1px solid ${auto ? "rgba(34,197,94,0.4)" : "rgba(168,85,247,0.4)"}`,
                  borderRadius: "8px",
                }}
              >
                <div style={{ fontSize: "11px", color: "#fff" }}>{s.category}</div>
                <div style={{ fontSize: "12px", color: ACCENT, fontWeight: 700 }}>
                  {s.paymentToken === "USDC" ? `$${s.amount.toFixed(2)}` : `${s.amount} ${s.paymentToken}`}
                </div>
                <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", color: auto ? "#22c55e" : "#a855f7", fontWeight: 600 }}>
                  {auto ? "auto" : "multisig"}
                </div>
                <div style={{ textAlign: "right" }}>
                  {s.txHash ? (
                    <a href={SOLSCAN_TX(s.txHash)} target="_blank" rel="noopener noreferrer" style={{ fontSize: "10px", color: "rgba(56,189,248,0.9)", textDecoration: "none", fontFamily: "monospace" }}>
                      tx{"↗"}
                    </a>
                  ) : (
                    <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.25)" }}>{"—"}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Challenge timeline (departures board)                              */
/* ------------------------------------------------------------------ */

function ChallengeTimeline({ jobs, loading }: { jobs: InChallengeJob[]; loading: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const WINDOW = 24 * 3600 * 1000; // full challenge window for the scale
  const rows = jobs
    .map((j) => ({ j, endAt: j.challengeEndAt ? new Date(j.challengeEndAt).getTime() : 0 }))
    .filter((r) => r.endAt > 0)
    .sort((a, b) => a.endAt - b.endAt);

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "14px" }}>
        <div style={label}>Challenge window timeline</div>
        <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>
          left edge = release now · right edge = full 24h remaining
        </div>
      </div>
      {loading ? (
        <Skeleton rows={4} />
      ) : rows.length === 0 ? (
        <Empty text="No jobs counting down right now." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
          {rows.map(({ j, endAt }) => {
            const remaining = Math.max(0, endAt - now);
            const frac = Math.min(1, remaining / WINDOW);
            const mins = Math.floor(remaining / 60000);
            const hh = Math.floor(mins / 60);
            const mm = mins % 60;
            const urgent = remaining < 2 * 3600 * 1000;
            return (
              <Link
                key={j.id}
                href={`/job/${j.id}`}
                style={{ display: "grid", gridTemplateColumns: "150px 1fr 70px", gap: "10px", alignItems: "center", textDecoration: "none", color: "inherit" }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "11px", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {j.title ?? j.category}
                  </div>
                  <div style={{ fontSize: "9px", color: ACCENT }}>
                    {j.paymentToken === "USDC" ? `$${j.amount.toFixed(2)}` : `${j.amount} ${j.paymentToken}`}
                  </div>
                </div>
                <div style={{ position: "relative", height: "16px", borderRadius: "4px", backgroundColor: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${frac * 100}%`,
                      backgroundColor: urgent ? "rgba(239,68,68,0.45)" : "rgba(56,189,248,0.4)",
                      borderRight: `2px solid ${urgent ? "#ef4444" : "#38bdf8"}`,
                      transition: "width 1s linear",
                    }}
                  />
                </div>
                <div style={{ fontSize: "11px", fontFamily: "monospace", color: urgent ? "#ef4444" : "rgba(255,255,255,0.7)", textAlign: "right" }}>
                  {hh > 0 ? `${hh}h ${mm}m` : `${mm}m`}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Activity heatmap (dow x hour)                                      */
/* ------------------------------------------------------------------ */

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ActivityHeatmap({ cells, loading }: { cells: HeatCell[]; loading: boolean }) {
  const grid: number[][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  let max = 0;
  for (const c of cells) {
    if (c.dow >= 0 && c.dow < 7 && c.hour >= 0 && c.hour < 24) {
      grid[c.dow][c.hour] = c.count;
      if (c.count > max) max = c.count;
    }
  }
  const intensity = (v: number): string => {
    if (v <= 0 || max === 0) return "rgba(255,255,255,0.04)";
    const a = 0.15 + 0.75 * (v / max);
    return `rgba(255,254,178,${a.toFixed(2)})`;
  };

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "14px" }}>
        <div style={label}>Settlement activity · last 30 days</div>
        <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>the agent economy runs 24/7</div>
      </div>
      {loading ? (
        <Skeleton rows={4} />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: "640px" }}>
            {/* hour axis */}
            <div style={{ display: "grid", gridTemplateColumns: "34px repeat(24, 1fr)", gap: "3px", marginBottom: "2px" }}>
              <div />
              {Array.from({ length: 24 }).map((_, h) => (
                <div key={h} style={{ fontSize: "7px", color: "rgba(255,255,255,0.3)", textAlign: "center" }}>
                  {h % 6 === 0 ? `${h}` : ""}
                </div>
              ))}
            </div>
            {grid.map((rowArr, dow) => (
              <div key={dow} style={{ display: "grid", gridTemplateColumns: "34px repeat(24, 1fr)", gap: "3px", alignItems: "center" }}>
                <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.4)" }}>{DOW_LABELS[dow]}</div>
                {rowArr.map((v, h) => (
                  <div
                    key={h}
                    title={`${DOW_LABELS[dow]} ${h}:00 · ${v} settlements`}
                    style={{ aspectRatio: "1", borderRadius: "2px", backgroundColor: intensity(v), minHeight: "12px" }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Category breakdown bars                                            */
/* ------------------------------------------------------------------ */

function CategoryBars({ categories, loading }: { categories: CategoryStat[]; loading: boolean }) {
  const cats = categories.filter((c) => c.settledUsdc > 0 || c.lockedUsdc > 0).sort((a, b) => b.settledUsdc + b.lockedUsdc - (a.settledUsdc + a.lockedUsdc));
  const maxV = Math.max(1, ...cats.map((c) => c.settledUsdc + c.lockedUsdc));

  return (
    <div style={card}>
      <div style={{ ...label, marginBottom: "14px" }}>Volume by category</div>
      {loading ? (
        <Skeleton rows={5} />
      ) : cats.length === 0 ? (
        <Empty text="No category volume yet." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {cats.map((c) => {
            const settledW = (c.settledUsdc / maxV) * 100;
            const lockedW = (c.lockedUsdc / maxV) * 100;
            return (
              <div key={c.category}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", marginBottom: "4px" }}>
                  <span style={{ color: "rgba(255,255,255,0.7)", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "2px", backgroundColor: colorFor(c.category) }} />
                    {c.category}
                  </span>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>
                    <strong style={{ color: ACCENT }}>{usd(c.settledUsdc)}</strong> settled · {usd(c.lockedUsdc)} locked
                  </span>
                </div>
                <div style={{ display: "flex", height: "8px", borderRadius: "4px", overflow: "hidden", backgroundColor: "rgba(255,255,255,0.05)" }}>
                  <div style={{ width: `${settledW}%`, backgroundColor: colorFor(c.category) }} />
                  <div style={{ width: `${lockedW}%`, backgroundColor: colorFor(c.category), opacity: 0.3 }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Top earners leaderboard                                            */
/* ------------------------------------------------------------------ */

function TopEarners({ earners, loading }: { earners: TopEarner[]; loading: boolean }) {
  const max = Math.max(1, ...earners.map((e) => e.earnedUsdc));
  return (
    <div style={card}>
      <div style={{ ...label, marginBottom: "14px" }}>Top earning agents</div>
      {loading ? (
        <Skeleton rows={5} />
      ) : earners.length === 0 ? (
        <Empty text="No agent earnings yet." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {earners.map((e, i) => (
            <div key={e.wallet} style={{ display: "grid", gridTemplateColumns: "20px 1fr 70px", gap: "8px", alignItems: "center" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: i < 3 ? ACCENT : "rgba(255,255,255,0.35)", textAlign: "center" }}>
                {i + 1}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "11px", fontFamily: "monospace", color: "#fff" }}>{shortWallet(e.wallet)}</div>
                <div style={{ height: "4px", marginTop: "3px", borderRadius: "2px", backgroundColor: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                  <div style={{ width: `${(e.earnedUsdc / max) * 100}%`, height: "100%", backgroundColor: ACCENT }} />
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "12px", color: ACCENT, fontWeight: 700 }}>{usd(e.earnedUsdc)}</div>
                <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.4)" }}>{e.jobsCompleted} jobs</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared bits                                                        */
/* ------------------------------------------------------------------ */

function Skeleton({ rows }: { rows: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ height: "40px", borderRadius: "8px", backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }} />
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", padding: "20px 0", textAlign: "center" }}>
      {text}
    </div>
  );
}
