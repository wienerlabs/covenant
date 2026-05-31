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

          {/* Dispute panel + protocol fee counter */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.3fr 1fr",
              gap: "16px",
              marginBottom: "16px",
            }}
          >
            <DisputePanel buckets={stats?.bucketCounts ?? null} disputeRate={stats?.disputeRate ?? 0} loading={loading} />
            <ProtocolFeeCounter fee={stats?.protocolFeeUsdc ?? 0} settled={stats?.totalSettledUsdc ?? 0} loading={loading} />
          </div>

          {/* Agent network graph */}
          <div style={{ marginBottom: "16px" }}>
            <AgentNetworkGraph edges={stats?.networkEdges ?? []} loading={loading} />
          </div>

          {/* Challenge window + recent settlements */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "16px",
              marginBottom: "16px",
            }}
          >
            <ChallengePanel jobs={stats?.inChallengeJobs ?? []} count={stats?.inChallengeNow ?? 0} loading={loading} />
            <RecentPanel items={stats?.recentSettlements ?? []} loading={loading} />
          </div>

          {/* Job inspector (mini block explorer) */}
          <JobInspector />
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
/*  Dispute & resolution panel                                         */
/* ------------------------------------------------------------------ */

function DisputePanel({ buckets, disputeRate, loading }: { buckets: BucketCounts | null; disputeRate: number; loading: boolean }) {
  const finalized = buckets?.Finalized ?? 0;
  const resolved = buckets?.Resolved ?? 0;
  const disputed = buckets?.Disputed ?? 0;
  const settledTotal = finalized + resolved + disputed;
  const autoPct = settledTotal > 0 ? finalized / settledTotal : 0;
  const resolvedPct = settledTotal > 0 ? resolved / settledTotal : 0;
  const openDisputePct = settledTotal > 0 ? disputed / settledTotal : 0;

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "14px" }}>
        <div style={label}>Disputes & resolution</div>
        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>
          dispute rate <strong style={{ color: disputeRate > 0.1 ? "#ef4444" : "#22c55e" }}>{pct(disputeRate)}</strong>
        </div>
      </div>
      {loading ? (
        <Skeleton rows={3} />
      ) : (
        <>
          {/* outcome bar */}
          <div style={{ display: "flex", height: "20px", borderRadius: "6px", overflow: "hidden", marginBottom: "16px", backgroundColor: "rgba(255,255,255,0.05)" }}>
            <div style={{ width: `${autoPct * 100}%`, backgroundColor: "#22c55e" }} title={`Auto-released ${finalized}`} />
            <div style={{ width: `${resolvedPct * 100}%`, backgroundColor: "#a855f7" }} title={`Multisig resolved ${resolved}`} />
            <div style={{ width: `${openDisputePct * 100}%`, backgroundColor: "#ef4444" }} title={`Open disputes ${disputed}`} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
            <Outcome color="#22c55e" label="Auto-released" value={finalized} sub="silent window" />
            <Outcome color="#a855f7" label="Multisig resolved" value={resolved} sub="2-of-3 committee" />
            <Outcome color="#ef4444" label="Open disputes" value={disputed} sub="awaiting committee" />
          </div>
          <div style={{ marginTop: "14px", fontSize: "10px", color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>
            Most jobs settle on the optimistic path. The 2-of-3 multisig only touches the cold path; a frivolous dispute burns the loser&apos;s bond and reputation.
          </div>
        </>
      )}
    </div>
  );
}

function Outcome({ color, label: l, value, sub }: { color: string; label: string; value: number; sub: string }) {
  return (
    <div style={{ padding: "10px", borderRadius: "8px", backgroundColor: "rgba(0,0,0,0.25)", border: `1px solid ${color}55` }}>
      <div style={{ fontSize: "20px", fontWeight: 800, color: "#fff" }}>{value}</div>
      <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", color, fontWeight: 600, marginTop: "2px" }}>{l}</div>
      <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.4)", marginTop: "2px" }}>{sub}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Protocol fee counter (animated)                                    */
/* ------------------------------------------------------------------ */

function ProtocolFeeCounter({ fee, settled, loading }: { fee: number; settled: number; loading: boolean }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const from = shown;
    const to = fee;
    const dur = 900;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(from + (to - from) * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fee]);

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", justifyContent: "center", background: "linear-gradient(135deg, rgba(20,241,149,0.08), rgba(255,255,255,0.03))" }}>
      <div style={{ ...label, marginBottom: "10px" }}>Protocol fee accrued</div>
      {loading ? (
        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)" }}>Loading...</div>
      ) : (
        <>
          <div style={{ fontSize: "34px", fontWeight: 800, color: "#14f195", fontFamily: "monospace", letterSpacing: "-0.02em" }}>
            ${shown.toFixed(4)}
          </div>
          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", marginTop: "6px", lineHeight: 1.5 }}>
            <strong style={{ color: "#fff" }}>20 bps</strong> on {usd(settled)} settled. The fee is the business; no token at launch.
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Agent network graph (circular layout)                              */
/* ------------------------------------------------------------------ */

function AgentNetworkGraph({ edges, loading }: { edges: NetworkEdge[]; loading: boolean }) {
  const { nodes, links } = useMemo(() => {
    const vol = new Map<string, number>();
    for (const e of edges) {
      vol.set(e.poster, (vol.get(e.poster) ?? 0) + e.amount);
      vol.set(e.taker, (vol.get(e.taker) ?? 0) + e.amount);
    }
    const top = [...vol.entries()].sort((a, b) => b[1] - a[1]).slice(0, 28).map(([w]) => w);
    const idx = new Map(top.map((w, i) => [w, i]));
    const W = 900;
    const H = 380;
    const cx = W / 2;
    const cy = H / 2;
    const R = 150;
    const maxVol = Math.max(1, ...top.map((w) => vol.get(w) ?? 0));
    const nodes = top.map((w, i) => {
      const a = (i / top.length) * Math.PI * 2 - Math.PI / 2;
      return {
        w,
        x: cx + R * Math.cos(a),
        y: cy + R * Math.sin(a),
        r: 3 + 7 * Math.sqrt((vol.get(w) ?? 0) / maxVol),
      };
    });
    const links = edges
      .filter((e) => idx.has(e.poster) && idx.has(e.taker) && e.poster !== e.taker)
      .slice(0, 80)
      .map((e) => ({ a: nodes[idx.get(e.poster)!], b: nodes[idx.get(e.taker)!], amount: e.amount }));
    return { nodes, links, W, H, cx, cy };
  }, [edges]);

  const W = 900;
  const H = 380;

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "12px" }}>
        <div style={label}>Agent settlement network</div>
        <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>nodes = wallets · edges = settlements · size = volume</div>
      </div>
      {loading ? (
        <Skeleton rows={5} />
      ) : nodes.length === 0 ? (
        <Empty text="No settlement edges yet." />
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="xMidYMid meet">
          {links.map((l, i) => (
            <line
              key={i}
              x1={l.a.x}
              y1={l.a.y}
              x2={l.b.x}
              y2={l.b.y}
              stroke="rgba(255,254,178,0.12)"
              strokeWidth={Math.min(2.5, 0.4 + l.amount / 20)}
            />
          ))}
          {nodes.map((n, i) => (
            <g key={i}>
              <circle cx={n.x} cy={n.y} r={n.r + 3} fill="rgba(255,254,178,0.08)" />
              <circle cx={n.x} cy={n.y} r={n.r} fill={ACCENT}>
                <animate attributeName="opacity" values="0.6;1;0.6" dur={`${2 + (i % 5) * 0.4}s`} repeatCount="indefinite" />
              </circle>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Job inspector (mini block explorer)                                */
/* ------------------------------------------------------------------ */

interface InspectorJob {
  id: string;
  pda: string | null;
  status: string;
  amount: number;
  paymentToken: string;
  category: string;
  posterWallet: string;
  takerWallet: string | null;
  createdAt: string;
  deliveredAt: string | null;
  challengeEndAt: string | null;
  txHash: string | null;
  specJson?: Record<string, unknown>;
  delivery?: { workHash?: string; deliveryUri?: string; txHash?: string | null } | null;
  dispute?: { resolution?: string } | null;
}

function JobInspector() {
  const [query, setQuery] = useState("");
  const [job, setJob] = useState<InspectorJob | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error" | "ok">("idle");
  const [err, setErr] = useState("");

  async function lookup() {
    const id = query.trim();
    if (!id) return;
    setState("loading");
    setErr("");
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`not found (${res.status})`);
      const data = await res.json();
      const j: InspectorJob = data.job ?? data;
      if (!j || !j.id) throw new Error("no job in response");
      setJob(j);
      setState("ok");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "lookup failed");
      setState("error");
    }
  }

  const steps = job
    ? [
        { label: "Created", at: job.createdAt, tx: job.txHash, on: true },
        { label: "Accepted", at: null, tx: null, on: !!job.takerWallet },
        { label: "Delivered", at: job.deliveredAt, tx: job.delivery?.txHash ?? null, on: !!job.deliveredAt },
        {
          label: job.status === "Disputed" ? "Disputed" : job.status === "Resolved" ? "Resolved" : "Finalized",
          at: job.status === "Finalized" || job.status === "Resolved" ? job.challengeEndAt : null,
          tx: null,
          on: ["Finalized", "Resolved", "Disputed"].includes(job.status),
        },
      ]
    : [];

  return (
    <div style={card}>
      <div style={{ ...label, marginBottom: "12px" }}>Job inspector</div>
      <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && lookup()}
          placeholder="Paste a job id and inspect its on-chain lifecycle..."
          style={{
            flex: 1,
            fontFamily: "monospace",
            fontSize: "12px",
            padding: "10px 14px",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: "6px",
            backgroundColor: "rgba(0,0,0,0.3)",
            color: "#fff",
            outline: "none",
          }}
        />
        <button
          onClick={lookup}
          style={{
            fontFamily: "inherit",
            fontSize: "11px",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            padding: "10px 22px",
            cursor: "pointer",
            border: `1px solid ${ACCENT}80`,
            borderRadius: "6px",
            backgroundColor: "rgba(255,254,178,0.12)",
            color: ACCENT,
            fontWeight: 600,
          }}
        >
          Inspect
        </button>
      </div>

      {state === "error" && (
        <div style={{ fontSize: "11px", color: "#ef4444" }}>Job {err}. Try a job id from the challenge or recent panels above.</div>
      )}
      {state === "idle" && (
        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>
          Every job is an on-chain state machine. Paste an id to walk its lifecycle: escrow lock, delivery commitment, challenge window, settlement.
        </div>
      )}

      {state === "ok" && job && (
        <div>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "16px", fontSize: "11px" }}>
            <Meta k="Status" v={job.status} accent />
            <Meta k="Amount" v={job.paymentToken === "USDC" ? `$${job.amount.toFixed(2)}` : `${job.amount} ${job.paymentToken}`} />
            <Meta k="Category" v={job.category} />
            <Meta k="Poster" v={shortWallet(job.posterWallet)} mono />
            <Meta k="Taker" v={shortWallet(job.takerWallet)} mono />
            {job.pda && <Meta k="PDA" v={`${job.pda.slice(0, 6)}…${job.pda.slice(-4)}`} mono />}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            {steps.map((s, i) => (
              <div key={i} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ width: "12px", height: "12px", borderRadius: "50%", backgroundColor: s.on ? ACCENT : "rgba(255,255,255,0.12)", border: s.on ? "none" : "1px solid rgba(255,255,255,0.2)" }} />
                  {i < steps.length - 1 && <div style={{ width: "2px", height: "28px", backgroundColor: s.on ? "rgba(255,254,178,0.3)" : "rgba(255,255,255,0.08)" }} />}
                </div>
                <div style={{ paddingBottom: "16px" }}>
                  <div style={{ fontSize: "12px", color: s.on ? "#fff" : "rgba(255,255,255,0.4)", fontWeight: 600 }}>{s.label}</div>
                  <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.45)" }}>
                    {s.at ? new Date(s.at).toLocaleString() : s.on ? "completed" : "pending"}
                    {s.tx && (
                      <a href={SOLSCAN_TX(s.tx)} target="_blank" rel="noopener noreferrer" style={{ color: "rgba(56,189,248,0.9)", textDecoration: "none", marginLeft: "8px" }}>
                        tx{"↗"}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Meta({ k, v, mono, accent }: { k: string; v: string; mono?: boolean; accent?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)" }}>{k}</div>
      <div style={{ fontSize: "12px", color: accent ? ACCENT : "#fff", fontWeight: 600, fontFamily: mono ? "monospace" : "inherit" }}>{v}</div>
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
