"use client";

import { useState, useEffect, useCallback } from "react";
import { USDC_LOGO_URL, SOL_LOGO_URL } from "@/lib/constants";
import NavBar from "@/components/NavBar";

type TabKey = "jobs" | "profiles" | "reputations" | "submissions" | "transactions";

interface JobRow {
  id: string;
  pda: string | null;
  posterWallet: string;
  takerWallet: string | null;
  amount: number;
  specHash: string;
  status: string;
  minWords: number;
  language: string;
  deadline: string;
  createdAt: string;
  updatedAt: string;
}

interface ProfileRow {
  id: string;
  walletAddress: string;
  displayName: string;
  bio: string;
  role: string;
  avatarSeed: string;
  createdAt: string;
  updatedAt: string;
}

interface ReputationRow {
  id: string;
  walletAddress: string;
  jobsCompleted: number;
  jobsFailed: number;
  totalEarned: number;
  firstJobAt: string | null;
  updatedAt: string;
}

interface SubmissionRow {
  id: string;
  jobId: string;
  takerWallet: string;
  textHash: string;
  wordCount: number;
  proofHex: string | null;
  verified: boolean;
  submittedAt: string;
}

interface TransactionRow {
  id: string;
  txHash: string;
  type: string;
  jobId: string | null;
  wallet: string;
  amount: number | null;
  status: string;
  createdAt: string;
}

interface AdminData {
  jobs: JobRow[];
  profiles: ProfileRow[];
  reputations: ReputationRow[];
  submissions: SubmissionRow[];
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "jobs", label: "JOBS" },
  { key: "profiles", label: "PROFILES" },
  { key: "reputations", label: "REPUTATION" },
  { key: "submissions", label: "SUBMISSIONS" },
  { key: "transactions", label: "TRANSACTIONS" },
];

function truncateWallet(wallet: string): string {
  if (wallet.length <= 10) return wallet;
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}

function truncateTxHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
}

function StatusBadgeDark({ status }: { status: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    Open: { bg: "rgba(255,255,255,0.15)", color: "#ffffff" },
    Accepted: { bg: "rgba(59,130,246,0.3)", color: "#93c5fd" },
    Completed: { bg: "rgba(34,197,94,0.3)", color: "#86efac" },
    Cancelled: { bg: "rgba(239,68,68,0.3)", color: "#fca5a5" },
    confirmed: { bg: "rgba(34,197,94,0.3)", color: "#86efac" },
    failed: { bg: "rgba(239,68,68,0.3)", color: "#fca5a5" },
  };
  const c = colors[status] || colors.Open;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "4px",
        fontSize: "10px",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        backgroundColor: c.bg,
        color: c.color,
        fontFamily: "inherit",
      }}
    >
      {status === "Completed" || status === "confirmed" ? "^ " : ""}
      {status}
    </span>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("jobs");
  const [data, setData] = useState<AdminData | null>(null);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [adminRes, txRes] = await Promise.all([
        fetch("/api/admin"),
        fetch("/api/transactions"),
      ]);
      if (adminRes.ok) {
        const json = await adminRes.json();
        setData(json);
      }
      if (txRes.ok) {
        const txJson = await txRes.json();
        setTransactions(txJson.transactions || []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const cellStyle: React.CSSProperties = {
    padding: "8px 12px",
    fontSize: "12px",
    color: "#ffffff",
    borderBottom: "1px solid rgba(255,255,255,0.1)",
    whiteSpace: "nowrap",
  };

  const headerCellStyle: React.CSSProperties = {
    ...cellStyle,
    fontSize: "10px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "rgba(255,255,255,0.6)",
    backgroundColor: "rgba(255,255,255,0.1)",
    fontWeight: 700,
  };

  function getRecordCount(): number {
    if (activeTab === "transactions") return transactions.length;
    if (!data) return 0;
    return data[activeTab as keyof AdminData].length;
  }

  function renderJobsTable() {
    if (!data) return null;
    return (
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={headerCellStyle}>ID</th>
            <th style={headerCellStyle}>Poster</th>
            <th style={headerCellStyle}>Taker</th>
            <th style={headerCellStyle}>Amount</th>
            <th style={headerCellStyle}>Status</th>
            <th style={headerCellStyle}>Min Words</th>
            <th style={headerCellStyle}>Deadline</th>
            <th style={headerCellStyle}>Created</th>
          </tr>
        </thead>
        <tbody>
          {data.jobs.map((job, i) => (
            <tr
              key={job.id}
              style={{
                backgroundColor:
                  i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.03)",
              }}
            >
              <td style={cellStyle}>{job.id.slice(0, 8)}...</td>
              <td style={cellStyle}>{truncateWallet(job.posterWallet)}</td>
              <td style={cellStyle}>
                {job.takerWallet ? truncateWallet(job.takerWallet) : "--"}
              </td>
              <td style={cellStyle}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <img
                    src={USDC_LOGO_URL}
                    alt="USDC"
                    width={12}
                    height={12}
                    style={{ borderRadius: "50%" }}
                  />
                  {job.amount.toFixed(2)}
                </span>
              </td>
              <td style={cellStyle}>
                <StatusBadgeDark status={job.status} />
              </td>
              <td style={cellStyle}>{job.minWords}</td>
              <td style={cellStyle}>{formatDate(job.deadline)}</td>
              <td style={cellStyle}>{formatDate(job.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  function renderProfilesTable() {
    if (!data) return null;
    return (
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={headerCellStyle}>ID</th>
            <th style={headerCellStyle}>Wallet</th>
            <th style={headerCellStyle}>Display Name</th>
            <th style={headerCellStyle}>Role</th>
            <th style={headerCellStyle}>Bio</th>
            <th style={headerCellStyle}>Created</th>
          </tr>
        </thead>
        <tbody>
          {data.profiles.map((p, i) => (
            <tr
              key={p.id}
              style={{
                backgroundColor:
                  i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.03)",
              }}
            >
              <td style={cellStyle}>{p.id.slice(0, 8)}...</td>
              <td style={cellStyle}>{truncateWallet(p.walletAddress)}</td>
              <td style={cellStyle}>{p.displayName}</td>
              <td style={cellStyle}>
                <span
                  style={{
                    textTransform: "uppercase",
                    fontSize: "10px",
                    color: "rgba(255,255,255,0.7)",
                  }}
                >
                  {p.role}
                </span>
              </td>
              <td style={{ ...cellStyle, maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis" }}>
                {p.bio || "--"}
              </td>
              <td style={cellStyle}>{formatDate(p.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  function renderReputationsTable() {
    if (!data) return null;
    return (
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={headerCellStyle}>ID</th>
            <th style={headerCellStyle}>Wallet</th>
            <th style={headerCellStyle}>Jobs Completed</th>
            <th style={headerCellStyle}>Jobs Failed</th>
            <th style={headerCellStyle}>Total Earned</th>
            <th style={headerCellStyle}>First Job</th>
            <th style={headerCellStyle}>Updated</th>
          </tr>
        </thead>
        <tbody>
          {data.reputations.map((r, i) => (
            <tr
              key={r.id}
              style={{
                backgroundColor:
                  i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.03)",
              }}
            >
              <td style={cellStyle}>{r.id.slice(0, 8)}...</td>
              <td style={cellStyle}>{truncateWallet(r.walletAddress)}</td>
              <td style={cellStyle}>{r.jobsCompleted}</td>
              <td style={cellStyle}>{r.jobsFailed}</td>
              <td style={cellStyle}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <img
                    src={USDC_LOGO_URL}
                    alt="USDC"
                    width={12}
                    height={12}
                    style={{ borderRadius: "50%" }}
                  />
                  {r.totalEarned.toFixed(2)}
                </span>
              </td>
              <td style={cellStyle}>
                {r.firstJobAt ? formatDate(r.firstJobAt) : "--"}
              </td>
              <td style={cellStyle}>{formatDate(r.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  function renderSubmissionsTable() {
    if (!data) return null;
    return (
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={headerCellStyle}>ID</th>
            <th style={headerCellStyle}>Job ID</th>
            <th style={headerCellStyle}>Taker</th>
            <th style={headerCellStyle}>Text Hash</th>
            <th style={headerCellStyle}>Word Count</th>
            <th style={headerCellStyle}>Verified</th>
            <th style={headerCellStyle}>Submitted</th>
          </tr>
        </thead>
        <tbody>
          {data.submissions.map((s, i) => (
            <tr
              key={s.id}
              style={{
                backgroundColor:
                  i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.03)",
              }}
            >
              <td style={cellStyle}>{s.id.slice(0, 8)}...</td>
              <td style={cellStyle}>{s.jobId.slice(0, 8)}...</td>
              <td style={cellStyle}>{truncateWallet(s.takerWallet)}</td>
              <td style={cellStyle}>{s.textHash.slice(0, 12)}...</td>
              <td style={cellStyle}>{s.wordCount}</td>
              <td style={cellStyle}>
                <StatusBadgeDark
                  status={s.verified ? "Completed" : "Open"}
                />
              </td>
              <td style={cellStyle}>{formatDate(s.submittedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  function renderTransactionsTable() {
    return (
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={headerCellStyle}>TX Hash</th>
            <th style={headerCellStyle}>Type</th>
            <th style={headerCellStyle}>Job ID</th>
            <th style={headerCellStyle}>Wallet</th>
            <th style={headerCellStyle}>Amount</th>
            <th style={headerCellStyle}>Status</th>
            <th style={headerCellStyle}>Timestamp</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx, i) => (
            <tr
              key={tx.id}
              style={{
                backgroundColor:
                  i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.03)",
              }}
            >
              <td style={cellStyle}>
                <a
                  href={`https://explorer.solana.com/tx/${tx.txHash}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "#5ba4f5",
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <img
                    src={SOL_LOGO_URL}
                    alt="SOL"
                    width={12}
                    height={12}
                    style={{ borderRadius: "50%" }}
                  />
                  {truncateTxHash(tx.txHash)}
                </a>
              </td>
              <td style={cellStyle}>
                <span
                  style={{
                    textTransform: "uppercase",
                    fontSize: "10px",
                    color: "rgba(255,255,255,0.7)",
                    letterSpacing: "0.03em",
                  }}
                >
                  {tx.type}
                </span>
              </td>
              <td style={cellStyle}>
                {tx.jobId ? tx.jobId.slice(0, 8) + "..." : "--"}
              </td>
              <td style={cellStyle}>{truncateWallet(tx.wallet)}</td>
              <td style={cellStyle}>
                {tx.amount != null ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <img
                      src={USDC_LOGO_URL}
                      alt="USDC"
                      width={12}
                      height={12}
                      style={{ borderRadius: "50%" }}
                    />
                    {tx.amount.toFixed(2)}
                  </span>
                ) : (
                  "--"
                )}
              </td>
              <td style={cellStyle}>
                <StatusBadgeDark status={tx.status} />
              </td>
              <td style={cellStyle}>{formatDate(tx.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  const tableRenderers: Record<TabKey, () => React.ReactNode> = {
    jobs: renderJobsTable,
    profiles: renderProfilesTable,
    reputations: renderReputationsTable,
    submissions: renderSubmissionsTable,
    transactions: renderTransactionsTable,
  };

  return (
    <div style={{ minHeight: "100vh", fontFamily: "inherit", position: "relative" }}>
      {/* Background */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          backgroundImage: "url('/poster-bg.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      />
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
        }}
      />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 2 }}>
        <NavBar activeTab="admin" variant="dark" />

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: "0",
            borderBottom: "1px solid rgba(255,255,255,0.1)",
            padding: "0 24px",
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                fontFamily: "inherit",
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                padding: "12px 20px",
                cursor: "pointer",
                border: "none",
                borderBottom:
                  activeTab === tab.key
                    ? "2px solid #ffffff"
                    : "2px solid transparent",
                backgroundColor: "transparent",
                color:
                  activeTab === tab.key ? "#ffffff" : "rgba(255,255,255,0.4)",
                transition: "all 0.15s ease",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Table content */}
        <div style={{ padding: "24px" }}>
          <div
            style={{
              backgroundColor: "rgba(255,255,255,0.07)",
              backdropFilter: "blur(16px)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "10px",
              overflow: "hidden",
            }}
          >
            {loading ? (
              <div
                style={{
                  padding: "40px",
                  textAlign: "center",
                  color: "rgba(255,255,255,0.4)",
                  fontSize: "12px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Loading data...
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                {tableRenderers[activeTab]()}
              </div>
            )}
          </div>

          {/* Record count */}
          {!loading && (
            <div
              style={{
                marginTop: "12px",
                fontSize: "11px",
                color: "rgba(255,255,255,0.4)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                textAlign: "right",
              }}
            >
              {getRecordCount()} records
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
