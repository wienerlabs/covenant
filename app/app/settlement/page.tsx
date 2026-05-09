"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import ChallengeCountdown from "@/components/ChallengeCountdown";

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

interface SettlementStats {
  bucketCounts: BucketCounts;
  totalSettledUsdc: number;
  totalEscrowLockedUsdc: number;
  autoReleaseRate: number;
  disputeRate: number;
  avgSettlementSeconds: number;
  inChallengeNow: number;
  inChallengeJobs: InChallengeJob[];
  recentSettlements: RecentSettlement[];
}

const LIFECYCLE_STAGES: {
  key: keyof BucketCounts;
  label: string;
  caption: string;
  accent: string;
}[] = [
  {
    key: "Open",
    label: "Open",
    caption: "Escrow locked, waiting for taker",
    accent: "rgba(255, 254, 178, 0.5)",
  },
  {
    key: "Accepted",
    label: "Accepted",
    caption: "Taker bound to job",
    accent: "rgba(168, 85, 247, 0.5)",
  },
  {
    key: "Delivered",
    label: "Delivered",
    caption: "24h challenge window open",
    accent: "rgba(56, 189, 248, 0.6)",
  },
  {
    key: "Finalized",
    label: "Finalized",
    caption: "Auto-released to taker",
    accent: "rgba(34, 197, 94, 0.6)",
  },
  {
    key: "Disputed",
    label: "Disputed",
    caption: "Awaiting committee",
    accent: "rgba(239, 68, 68, 0.55)",
  },
  {
    key: "Resolved",
    label: "Resolved",
    caption: "Multisig signed outcome",
    accent: "rgba(34, 197, 94, 0.4)",
  },
];

const SOLSCAN_TX = (hash: string): string =>
  `https://solscan.io/tx/${hash}?cluster=devnet`;

function formatUsdc(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}k`;
  return `$${value.toFixed(2)}`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86_400).toFixed(1)}d`;
}

function shortWallet(wallet: string | null): string {
  if (!wallet) return "—";
  return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
}

function timeAgo(iso: string): string {
  const delta = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (delta < 60) return `${Math.round(delta)}s ago`;
  if (delta < 3600) return `${Math.round(delta / 60)}m ago`;
  if (delta < 86_400) return `${Math.round(delta / 3600)}h ago`;
  return `${Math.round(delta / 86_400)}d ago`;
}

export default function SettlementPage() {
  const [stats, setStats] = useState<SettlementStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "load failed");
          setLoading(false);
        }
      }
    }
    load();
    const interval = setInterval(load, 7_500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const totalJobs = useMemo(() => {
    if (!stats) return 0;
    return Object.values(stats.bucketCounts).reduce((a, b) => a + b, 0);
  }, [stats]);

  const cardStyle: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "12px",
    backgroundColor: "rgba(255,255,255,0.05)",
    backdropFilter: "blur(16px)",
    padding: "24px",
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: "10px",
    textTransform: "uppercase",
    letterSpacing: "0.14em",
    color: "rgba(255,255,255,0.45)",
    marginBottom: "14px",
    fontWeight: 600,
  };

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
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1,
          backgroundColor: "rgba(0,0,0,0.32)",
        }}
      />

      <div style={{ position: "relative", zIndex: 2 }}>
        <NavBar activeTab="settlement" variant="dark" />

        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "48px 24px 96px" }}>
          {/* Hero */}
          <div style={{ textAlign: "center", marginBottom: "56px" }}>
            <div
              style={{
                fontSize: "10px",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(255, 254, 178, 0.7)",
                marginBottom: "16px",
                fontWeight: 600,
              }}
            >
              Live · Solana Devnet
            </div>
            <h1
              style={{
                fontSize: "40px",
                fontWeight: 800,
                color: "#ffffff",
                letterSpacing: "0.02em",
                lineHeight: 1.15,
                marginBottom: "20px",
              }}
            >
              Settlement, in real time.
            </h1>
            <p
              style={{
                fontSize: "15px",
                color: "rgba(255,255,255,0.6)",
                maxWidth: "640px",
                margin: "0 auto 18px",
                lineHeight: 1.7,
              }}
            >
              Every job locks USDC into a Program Derived Address. When work is
              delivered, a 24 hour challenge window opens. No challenge, the
              escrow auto releases on chain. This page is a window into that
              loop, refreshing every 7 seconds.
            </p>
            <p
              style={{
                fontSize: "13px",
                color: "rgba(255, 254, 178, 0.65)",
                fontStyle: "italic",
                margin: 0,
              }}
            >
              x402 powers paid access. Covenant powers paid work.
            </p>
          </div>

          {/* Top stat cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "16px",
              marginBottom: "48px",
            }}
          >
            <StatCard
              label="Settled volume"
              value={loading ? "—" : formatUsdc(stats?.totalSettledUsdc ?? 0)}
              caption="USDC released by the program"
              accent="#22c55e"
            />
            <StatCard
              label="In escrow now"
              value={loading ? "—" : formatUsdc(stats?.totalEscrowLockedUsdc ?? 0)}
              caption="Locked across active jobs"
              accent="#fffeb2"
            />
            <StatCard
              label="Auto release rate"
              value={loading ? "—" : formatPercent(stats?.autoReleaseRate ?? 0)}
              caption={`Disputed: ${stats ? formatPercent(stats.disputeRate) : "—"}`}
              accent="#a855f7"
            />
            <StatCard
              label="Avg settle time"
              value={loading ? "—" : formatDuration(stats?.avgSettlementSeconds ?? 0)}
              caption="Delivered → finalized"
              accent="#38bdf8"
            />
          </div>

          {/* Lifecycle state machine */}
          <div style={{ ...cardStyle, marginBottom: "32px" }}>
            <div style={sectionTitle}>Lifecycle, by live count</div>
            <p
              style={{
                fontSize: "13px",
                color: "rgba(255,255,255,0.55)",
                marginBottom: "24px",
                lineHeight: 1.6,
              }}
            >
              Total jobs through the protocol:{" "}
              <strong style={{ color: "#ffffff" }}>{totalJobs}</strong>. Each
              column is a real bucket in the database, mirroring the on chain
              JobEscrow account state.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(6, 1fr)",
                gap: "10px",
              }}
            >
              {LIFECYCLE_STAGES.map((stage, i) => {
                const count = stats?.bucketCounts[stage.key] ?? 0;
                return (
                  <div
                    key={stage.key}
                    style={{
                      position: "relative",
                      padding: "16px 12px",
                      borderRadius: "10px",
                      border: `1px solid ${stage.accent}`,
                      backgroundColor: "rgba(0,0,0,0.25)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "9px",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        color: "rgba(255,255,255,0.45)",
                      }}
                    >
                      {`0${i + 1}`.slice(-2)} · {stage.label}
                    </div>
                    <div
                      style={{
                        fontSize: "26px",
                        fontWeight: 800,
                        color: "#ffffff",
                        letterSpacing: "0.01em",
                      }}
                    >
                      {count}
                    </div>
                    <div
                      style={{
                        fontSize: "10px",
                        color: "rgba(255,255,255,0.45)",
                        lineHeight: 1.4,
                      }}
                    >
                      {stage.caption}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* In challenge window now */}
          <div style={{ ...cardStyle, marginBottom: "32px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "18px",
              }}
            >
              <div>
                <div style={sectionTitle}>In challenge window now</div>
                <p
                  style={{
                    fontSize: "13px",
                    color: "rgba(255,255,255,0.55)",
                    margin: 0,
                    lineHeight: 1.6,
                  }}
                >
                  Delivered jobs counting down to auto-release. If no challenge
                  is filed before zero, the program releases USDC to the taker
                  on chain.
                </p>
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "rgba(56, 189, 248, 0.9)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                {stats?.inChallengeNow ?? 0} live
              </div>
            </div>

            {loading && <SkeletonRows rows={3} />}
            {!loading && stats && stats.inChallengeJobs.length === 0 && (
              <div
                style={{
                  fontSize: "12px",
                  color: "rgba(255,255,255,0.4)",
                  padding: "20px 0",
                  textAlign: "center",
                }}
              >
                No jobs in the challenge window right now. New deliveries land
                here as they happen.
              </div>
            )}
            {!loading && stats && stats.inChallengeJobs.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {stats.inChallengeJobs.map((job) => (
                  <ChallengeRow key={job.id} job={job} />
                ))}
              </div>
            )}
          </div>

          {/* Recent settlements */}
          <div style={{ ...cardStyle, marginBottom: "32px" }}>
            <div style={sectionTitle}>Recent settlements</div>
            {loading && <SkeletonRows rows={4} />}
            {!loading && stats && stats.recentSettlements.length === 0 && (
              <div
                style={{
                  fontSize: "12px",
                  color: "rgba(255,255,255,0.4)",
                  padding: "20px 0",
                  textAlign: "center",
                }}
              >
                No settled jobs yet on this cluster.
              </div>
            )}
            {!loading && stats && stats.recentSettlements.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {stats.recentSettlements.map((s) => (
                  <SettlementRow key={s.id} settlement={s} />
                ))}
              </div>
            )}
          </div>

          {/* Why optimistic */}
          <div style={{ ...cardStyle }}>
            <div style={sectionTitle}>Why optimistic</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "16px",
              }}
            >
              <ExplainerCard
                title="No oracle, no ZK"
                body="The happy path is silence. If nobody disputes within 24 hours, the program releases the escrow on chain. Cheap, fast, and free of trusted oracles."
              />
              <ExplainerCard
                title="2 of 3 multisig"
                body="When a dispute is filed, a staked committee resolves it on chain. Frivolous disputes burn the loser's bond and reputation, so the cold path stays cold."
              />
              <ExplainerCard
                title="Sub-cent rail"
                body="Built on Solana for a reason. A 50 cent micro-job needs a chain where settlement gas is in the noise. Solana clears it. EVM L2s do not."
              />
            </div>
          </div>

          {error && (
            <div
              style={{
                marginTop: "24px",
                fontSize: "11px",
                color: "rgba(239, 68, 68, 0.8)",
                textAlign: "center",
              }}
            >
              {`Stats endpoint error: ${error}`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  caption: string;
  accent: string;
}

function StatCard({ label, value, caption, accent }: StatCardProps) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "12px",
        backgroundColor: "rgba(255,255,255,0.04)",
        backdropFilter: "blur(16px)",
        padding: "20px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "32px",
          height: "2px",
          backgroundColor: accent,
        }}
      />
      <div
        style={{
          fontSize: "10px",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.45)",
          marginBottom: "10px",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "26px",
          fontWeight: 800,
          color: "#ffffff",
          letterSpacing: "0.01em",
          marginBottom: "6px",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: "11px",
          color: "rgba(255,255,255,0.4)",
          lineHeight: 1.5,
        }}
      >
        {caption}
      </div>
    </div>
  );
}

interface ChallengeRowProps {
  job: InChallengeJob;
}

function ChallengeRow({ job }: ChallengeRowProps) {
  const endAt = job.challengeEndAt ? new Date(job.challengeEndAt).getTime() : 0;
  return (
    <Link
      href={`/job/${job.id}`}
      style={{
        display: "grid",
        gridTemplateColumns: "1.4fr 0.8fr 0.8fr 0.8fr 0.6fr",
        gap: "12px",
        alignItems: "center",
        padding: "12px 16px",
        backgroundColor: "rgba(56, 189, 248, 0.06)",
        border: "1px solid rgba(56, 189, 248, 0.2)",
        borderRadius: "8px",
        textDecoration: "none",
        color: "inherit",
        transition: "all 0.15s ease",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: "12px",
            color: "#ffffff",
            fontWeight: 600,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {job.title ?? job.category}
        </div>
        <div
          style={{
            fontSize: "10px",
            color: "rgba(255,255,255,0.4)",
            fontFamily: "monospace",
            marginTop: "2px",
          }}
        >
          {job.pda ? `${job.pda.slice(0, 8)}…${job.pda.slice(-6)}` : job.id.slice(0, 10)}
        </div>
      </div>
      <div
        style={{
          fontSize: "12px",
          color: "rgba(255,255,255,0.7)",
          fontFamily: "monospace",
        }}
      >
        {shortWallet(job.posterWallet)}
        <span style={{ color: "rgba(255,255,255,0.3)", margin: "0 6px" }}>→</span>
        {shortWallet(job.takerWallet)}
      </div>
      <div style={{ fontSize: "13px", color: "#fffeb2", fontWeight: 700 }}>
        {job.paymentToken === "USDC"
          ? `$${job.amount.toFixed(2)}`
          : `${job.amount.toFixed(3)} ${job.paymentToken}`}
      </div>
      <div>
        {endAt > 0 && (
          <ChallengeCountdown
            endAt={endAt}
            variant="dark"
            label="Auto-release in"
          />
        )}
      </div>
      <div
        style={{
          fontSize: "10px",
          color: "rgba(56, 189, 248, 0.9)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontWeight: 600,
          textAlign: "right",
        }}
      >
        Delivered
      </div>
    </Link>
  );
}

interface SettlementRowProps {
  settlement: RecentSettlement;
}

function SettlementRow({ settlement }: SettlementRowProps) {
  const isAuto = settlement.outcome === "auto_release";
  const accent = isAuto
    ? "rgba(34, 197, 94, 0.5)"
    : "rgba(168, 85, 247, 0.5)";
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 0.6fr 0.8fr 0.7fr 0.6fr",
        gap: "12px",
        alignItems: "center",
        padding: "10px 16px",
        backgroundColor: "rgba(255,255,255,0.03)",
        border: `1px solid ${accent}`,
        borderRadius: "8px",
      }}
    >
      <div style={{ fontSize: "12px", color: "#ffffff", fontWeight: 500 }}>
        {settlement.category}
      </div>
      <div style={{ fontSize: "12px", color: "#fffeb2", fontWeight: 700 }}>
        {settlement.paymentToken === "USDC"
          ? `$${settlement.amount.toFixed(2)}`
          : `${settlement.amount.toFixed(3)} ${settlement.paymentToken}`}
      </div>
      <div
        style={{
          fontSize: "10px",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: isAuto ? "#22c55e" : "#a855f7",
          fontWeight: 600,
        }}
      >
        {isAuto ? "Auto release" : "Multisig resolved"}
      </div>
      <div
        style={{
          fontSize: "11px",
          color: "rgba(255,255,255,0.5)",
        }}
      >
        {timeAgo(settlement.finalizedAt)}
      </div>
      <div style={{ textAlign: "right" }}>
        {settlement.txHash ? (
          <a
            href={SOLSCAN_TX(settlement.txHash)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: "10px",
              color: "rgba(56, 189, 248, 0.9)",
              textDecoration: "none",
              fontFamily: "monospace",
              letterSpacing: "0.05em",
            }}
          >
            tx ↗
          </a>
        ) : (
          <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.25)" }}>
            —
          </span>
        )}
      </div>
    </div>
  );
}

interface ExplainerCardProps {
  title: string;
  body: string;
}

function ExplainerCard({ title, body }: ExplainerCardProps) {
  return (
    <div
      style={{
        padding: "18px",
        borderRadius: "10px",
        backgroundColor: "rgba(0,0,0,0.25)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div
        style={{
          fontSize: "13px",
          fontWeight: 700,
          color: "#fffeb2",
          marginBottom: "10px",
          letterSpacing: "0.02em",
        }}
      >
        {title}
      </div>
      <p
        style={{
          fontSize: "12px",
          color: "rgba(255,255,255,0.6)",
          lineHeight: 1.65,
          margin: 0,
        }}
      >
        {body}
      </p>
    </div>
  );
}

interface SkeletonRowsProps {
  rows: number;
}

function SkeletonRows({ rows }: SkeletonRowsProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            height: "44px",
            borderRadius: "8px",
            backgroundColor: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        />
      ))}
    </div>
  );
}
