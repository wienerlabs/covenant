"use client";

import { useState, useEffect, useCallback } from "react";
import NavBar from "@/components/NavBar";

/**
 * /admin/ops — operational dashboard
 *
 * Single-page view onto the new admin endpoints (/api/admin/db-stats,
 * /api/admin/cache-stats, /api/admin/error-buffer). Auto-refreshes
 * every 5 seconds so live ops can watch row counts climb during a
 * load test or watch error rates settle after a deploy.
 *
 * Auth pattern matches /admin/page.tsx — Bearer secret stored in
 * sessionStorage so the page doesn't re-prompt on every reload.
 */

const SECRET_STORAGE_KEY = "covenant.admin.secret";
const POLL_MS = 5000;

interface DbStats {
  collected_at: string;
  duration_ms: number;
  cluster: string;
  postgres_version?: string;
  tables: Record<string, number>;
  jobs: {
    by_status: Record<string, number>;
    total_amount_usdc: number;
    avg_amount_usdc: number;
    completed_in_last_24h: number;
    open_now: number;
  };
  claims: {
    by_status: Record<string, number>;
    active_tvl_usdc: number;
  };
  arena: {
    total_battles: number;
    last_battle_at: string | null;
  };
  cache: {
    hits: number;
    misses: number;
    staleHits: number;
    evictions: number;
    errors: number;
    size: number;
    max: number;
  };
  errors: string[];
}

interface CacheStats {
  hits: number;
  misses: number;
  staleHits: number;
  evictions: number;
  errors: number;
  size: number;
  max: number;
  total_requests: number;
  hit_rate: number;
  instance_uptime_ms: number | null;
}

interface ErrorBufferEntry {
  recorded_at: string;
  ts: string;
  level: string;
  msg: string;
  request_id?: string;
  route?: string;
  err_message?: string;
}

interface ErrorBufferResponse {
  stats: { count: number; capacity: number; oldest: string | null; newest: string | null };
  entries: ErrorBufferEntry[];
}

export default function OpsPage() {
  const [secret, setSecret] = useState<string | null>(null);
  const [secretInput, setSecretInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [db, setDb] = useState<DbStats | null>(null);
  const [cache, setCache] = useState<CacheStats | null>(null);
  const [errs, setErrs] = useState<ErrorBufferResponse | null>(null);
  const [version, setVersion] = useState<{ commit_short?: string; region?: string } | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.sessionStorage.getItem(SECRET_STORAGE_KEY);
    if (stored) setSecret(stored);
  }, []);

  const refresh = useCallback(async () => {
    if (!secret) return;
    setLoading(true);
    const headers = { Authorization: `Bearer ${secret}` };
    try {
      const [dbR, cacheR, errR, verR] = await Promise.all([
        fetch("/api/admin/db-stats", { headers }),
        fetch("/api/admin/cache-stats", { headers }),
        fetch("/api/admin/error-buffer?limit=20", { headers }),
        fetch("/api/version"),
      ]);
      if (dbR.status === 401) {
        if (typeof window !== "undefined") {
          window.sessionStorage.removeItem(SECRET_STORAGE_KEY);
        }
        setSecret(null);
        setAuthError("Stored secret rejected.");
        return;
      }
      if (dbR.ok) {
        const json = await dbR.json();
        setDb(json.data ?? json);
      }
      if (cacheR.ok) {
        const json = await cacheR.json();
        setCache(json.data ?? json);
      }
      if (errR.ok) {
        const json = await errR.json();
        setErrs(json.data ?? json);
      }
      if (verR.ok) {
        setVersion(await verR.json());
      }
      setLastRefresh(new Date());
    } catch {
      /* swallow */
    } finally {
      setLoading(false);
    }
  }, [secret]);

  useEffect(() => {
    if (!secret) return;
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [secret, refresh]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const trimmed = secretInput.trim();
    if (!trimmed) return;
    const r = await fetch("/api/admin/db-stats", {
      headers: { Authorization: `Bearer ${trimmed}` },
    });
    if (r.status === 401) {
      setAuthError("Wrong secret.");
      return;
    }
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(SECRET_STORAGE_KEY, trimmed);
    }
    setSecret(trimmed);
    setSecretInput("");
  };

  const clearCache = async () => {
    if (!secret || !confirm("Clear in-memory cache?")) return;
    await fetch("/api/admin/cache-stats", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${secret}` },
    });
    refresh();
  };

  const clearErrorBuffer = async () => {
    if (!secret || !confirm("Clear error buffer?")) return;
    await fetch("/api/admin/error-buffer", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${secret}` },
    });
    refresh();
  };

  // --------- Login screen ---------
  if (!secret) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a14", color: "#fff" }}>
        <NavBar activeTab="onchain" variant="dark" />
        <main style={{ maxWidth: 420, margin: "0 auto", padding: "80px 24px" }}>
          <div
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 10,
              padding: 28,
            }}
          >
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px 0" }}>
              Ops Console
            </h1>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: "0 0 20px 0" }}>
              Bearer secret required (ADMIN_SECRET or CRON_SECRET).
            </p>
            <form onSubmit={handleLogin}>
              <input
                type="password"
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                placeholder="Admin secret"
                autoFocus
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  fontFamily: "inherit",
                  fontSize: 13,
                  background: "rgba(0,0,0,0.4)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 6,
                  color: "#fff",
                  outline: "none",
                  marginBottom: 12,
                }}
              />
              {authError && (
                <div style={{ fontSize: 12, color: "#ff6b6b", marginBottom: 12 }}>
                  {authError}
                </div>
              )}
              <button
                type="submit"
                style={{
                  width: "100%",
                  padding: "10px",
                  fontFamily: "inherit",
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.25)",
                  borderRadius: 6,
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Sign In
              </button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  // --------- Dashboard ---------
  return (
    <div style={{ minHeight: "100vh", background: "#0a0a14", color: "#fff" }}>
      <NavBar activeTab="onchain" variant="dark" />
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px 64px" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 24,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Ops Console</h1>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
              {version?.commit_short && (
                <>
                  commit{" "}
                  <code style={{ color: "rgba(255,255,255,0.7)" }}>{version.commit_short}</code>
                  {" · "}
                </>
              )}
              {version?.region && <>region {version.region} · </>}
              {lastRefresh && (
                <>refreshed {lastRefresh.toLocaleTimeString()}</>
              )}
              {loading && " · refreshing…"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={refresh} style={btnSecondary}>Refresh</button>
            <button onClick={clearCache} style={btnDanger}>Clear cache</button>
            <button onClick={clearErrorBuffer} style={btnDanger}>Clear errors</button>
          </div>
        </div>

        {/* DB stats */}
        {db && (
          <Section title="Database">
            <KpiRow>
              <Kpi label="cluster" value={db.cluster} />
              <Kpi label="postgres" value={db.postgres_version?.split(" ")[0] ?? "?"} mono />
              <Kpi label="snapshot" value={`${db.duration_ms}ms`} />
              <Kpi label="errors" value={db.errors.length} accent={db.errors.length > 0 ? "warn" : "ok"} />
            </KpiRow>
            <SubHeader>Jobs</SubHeader>
            <KpiRow>
              <Kpi label="open" value={db.jobs.open_now} accent="ok" />
              <Kpi label="completed (24h)" value={db.jobs.completed_in_last_24h} />
              <Kpi label="total volume" value={`${db.jobs.total_amount_usdc} USDC`} />
              <Kpi label="avg amount" value={`${db.jobs.avg_amount_usdc} USDC`} />
            </KpiRow>
            <SubHeader>Status breakdown</SubHeader>
            <Pills items={db.jobs.by_status} />
            <SubHeader>Claims (Covenant Credit)</SubHeader>
            <KpiRow>
              <Kpi label="active TVL" value={`${db.claims.active_tvl_usdc} USDC`} />
            </KpiRow>
            <Pills items={db.claims.by_status} />
            <SubHeader>Table row counts</SubHeader>
            <table style={tableStyle}>
              <tbody>
                {Object.entries(db.tables).map(([name, count]) => (
                  <tr key={name}>
                    <td style={tdName}>{name}</td>
                    <td
                      style={{ ...tdNum, color: count < 0 ? "#ff6b6b" : "rgba(255,255,255,0.85)" }}
                    >
                      {count < 0 ? "error" : count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {/* Cache stats */}
        {cache && (
          <Section title="Cache">
            <KpiRow>
              <Kpi label="hit rate" value={`${(cache.hit_rate * 100).toFixed(1)}%`} accent={cache.hit_rate > 0.7 ? "ok" : "warn"} />
              <Kpi label="hits" value={cache.hits} />
              <Kpi label="stale hits" value={cache.staleHits} />
              <Kpi label="misses" value={cache.misses} />
              <Kpi label="evictions" value={cache.evictions} />
              <Kpi label="errors" value={cache.errors} accent={cache.errors > 0 ? "warn" : "ok"} />
              <Kpi label="entries" value={`${cache.size}/${cache.max}`} />
            </KpiRow>
          </Section>
        )}

        {/* Error buffer */}
        {errs && (
          <Section title={`Error buffer (${errs.stats.count}/${errs.stats.capacity})`}>
            {errs.entries.length === 0 ? (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                No errors recorded since this serverless instance started.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {errs.entries.map((e, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: "rgba(255,80,80,0.06)",
                      border: "1px solid rgba(255,80,80,0.18)",
                      borderRadius: 6,
                      padding: "10px 12px",
                      fontSize: 11,
                      fontFamily: "monospace",
                    }}
                  >
                    <div style={{ color: "#ff9090", fontWeight: 600 }}>
                      {e.msg}
                    </div>
                    <div style={{ color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                      {e.recorded_at.replace("T", " ").slice(0, 19)}
                      {e.route && <> · {e.route}</>}
                      {e.request_id && <> · {e.request_id}</>}
                    </div>
                    {e.err_message && (
                      <div
                        style={{
                          marginTop: 6,
                          color: "rgba(255,255,255,0.7)",
                          wordBreak: "break-word",
                          fontSize: 11,
                        }}
                      >
                        {e.err_message}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}
      </main>
    </div>
  );
}

// ---------- Tiny subcomponents ----------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 10,
        padding: "20px 24px",
        marginBottom: 18,
      }}
    >
      <h2
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.16em",
          color: "rgba(255,255,255,0.5)",
          margin: "0 0 14px 0",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function SubHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        color: "rgba(255,255,255,0.35)",
        marginTop: 16,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function KpiRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>{children}</div>
  );
}

function Kpi({
  label,
  value,
  accent,
  mono,
}: {
  label: string;
  value: string | number;
  accent?: "ok" | "warn";
  mono?: boolean;
}) {
  const color =
    accent === "warn"
      ? "#ffc940"
      : accent === "ok"
        ? "#00d670"
        : "#ffffff";
  return (
    <div
      style={{
        background: "rgba(0,0,0,0.3)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 6,
        padding: "8px 14px",
        minWidth: 90,
      }}
    >
      <div
        style={{
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "rgba(255,255,255,0.45)",
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          color,
          fontFamily: mono ? "monospace" : "inherit",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Pills({ items }: { items: Record<string, number> }) {
  if (Object.keys(items).length === 0) return <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>none</div>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {Object.entries(items).map(([k, v]) => (
        <div
          key={k}
          style={{
            fontSize: 11,
            padding: "4px 10px",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 99,
          }}
        >
          {k} <span style={{ color: "rgba(255,255,255,0.5)", marginLeft: 4 }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
};

const tdName: React.CSSProperties = {
  padding: "6px 0",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.7)",
  fontFamily: "monospace",
};

const tdNum: React.CSSProperties = {
  padding: "6px 0",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

const btnSecondary: React.CSSProperties = {
  padding: "8px 14px",
  fontFamily: "inherit",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 6,
  color: "#ffffff",
  cursor: "pointer",
};

const btnDanger: React.CSSProperties = {
  ...btnSecondary,
  background: "rgba(255,80,80,0.1)",
  border: "1px solid rgba(255,80,80,0.3)",
  color: "#ff9090",
};
