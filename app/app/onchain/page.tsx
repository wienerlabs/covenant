"use client";

import { useState, useEffect } from "react";
import NavBar from "@/components/NavBar";
import { SOL_LOGO_URL, USDC_LOGO_URL } from "@/lib/constants";

interface OnchainData {
  program: {
    id: string;
    executable: boolean | null;
    size: number | null;
    lamports: number | null;
    balance: number | null;
  };
  wallets: {
    deployer: { address: string; balance: number };
    alpha: { address: string; balance: number };
    omega: { address: string; balance: number };
  };
}

interface TokenBalances {
  deployer: { sol: number; usdc: number };
  alpha: { sol: number; usdc: number };
  omega: { sol: number; usdc: number };
}

function truncate(addr: string): string {
  if (addr.length < 12) return addr;
  return addr.slice(0, 6) + "..." + addr.slice(-6);
}

export default function OnchainPage() {
  const [data, setData] = useState<OnchainData | null>(null);
  const [tokenBalances, setTokenBalances] = useState<TokenBalances | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<string>("");

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/onchain");
        if (res.ok) {
          const json = await res.json();
          setData(json);
          setLastRefresh(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }));

          // Fetch token balances for each wallet
          const wallets = json.wallets;
          const [dBal, aBal, oBal] = await Promise.all([
            fetch(`/api/balance/${wallets.deployer.address}`).then(r => r.ok ? r.json() : { sol: 0, usdc: 0 }).catch(() => ({ sol: 0, usdc: 0 })),
            fetch(`/api/balance/${wallets.alpha.address}`).then(r => r.ok ? r.json() : { sol: 0, usdc: 0 }).catch(() => ({ sol: 0, usdc: 0 })),
            fetch(`/api/balance/${wallets.omega.address}`).then(r => r.ok ? r.json() : { sol: 0, usdc: 0 }).catch(() => ({ sol: 0, usdc: 0 })),
          ]);
          setTokenBalances({ deployer: dBal, alpha: aBal, omega: oBal });
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);

  const glassCard: React.CSSProperties = {
    backgroundColor: "rgba(255,255,255,0.07)",
    backdropFilter: "blur(16px)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "10px",
    padding: "24px",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "10px",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: "rgba(255,255,255,0.4)",
    marginBottom: "4px",
  };

  const valueStyle: React.CSSProperties = {
    fontSize: "13px",
    color: "rgba(255,255,255,0.85)",
    fontFamily: "monospace",
    wordBreak: "break-all",
  };

  return (
    <div style={{ minHeight: "100vh", fontFamily: "inherit", position: "relative" }}>
      {/* Background */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "url('/poster-bg.png')", backgroundSize: "cover", backgroundPosition: "center" }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 1, backgroundColor: "rgba(0,0,0,0.6)" }} />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 2 }}>
        <NavBar activeTab="onchain" variant="dark" />

        <div style={{ maxWidth: "900px", margin: "0 auto", padding: "32px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
            <div>
              <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: "-0.01em", margin: "0 0 4px 0" }}>
                On-Chain Explorer
              </h1>
              <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", margin: 0 }}>
                Live Solana devnet account data. Auto-refreshes every 15s.
              </p>
            </div>
            {lastRefresh && (
              <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Last: {lastRefresh}
              </span>
            )}
          </div>

          {loading ? (
            <div style={{ ...glassCard, textAlign: "center", color: "rgba(255,255,255,0.4)", padding: "60px" }}>
              Loading on-chain data...
            </div>
          ) : !data ? (
            <div style={{ ...glassCard, textAlign: "center", color: "rgba(255,100,100,0.7)", padding: "60px" }}>
              Failed to load on-chain data.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Program Status Card */}
              <div style={glassCard}>
                <div style={{ ...labelStyle, marginBottom: "16px", fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>
                  Program Status
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  <div>
                    <div style={labelStyle}>Program ID</div>
                    <div style={valueStyle}>{truncate(data.program.id)}</div>
                    <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.25)", marginTop: "2px" }}>{data.program.id}</div>
                  </div>
                  <div>
                    <div style={labelStyle}>Executable</div>
                    <div style={{ ...valueStyle, color: data.program.executable ? "#FFE342" : "rgba(255,255,255,0.4)" }}>
                      {data.program.executable === null ? "Unknown" : data.program.executable ? "Yes" : "No"}
                    </div>
                  </div>
                  <div>
                    <div style={labelStyle}>Account Size</div>
                    <div style={valueStyle}>
                      {data.program.size !== null ? `${data.program.size.toLocaleString()} bytes` : "N/A"}
                    </div>
                  </div>
                  <div>
                    <div style={labelStyle}>Balance</div>
                    <div style={{ ...valueStyle, display: "flex", alignItems: "center", gap: "6px" }}>
                      <img src={SOL_LOGO_URL} alt="SOL" width={14} height={14} style={{ borderRadius: "50%" }} />
                      {data.program.balance !== null ? data.program.balance.toFixed(6) + " SOL" : "N/A"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Wallet Balances */}
              <div style={glassCard}>
                <div style={{ ...labelStyle, marginBottom: "16px", fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>
                  Wallet Balances
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {([
                    { label: "Deployer", data: data.wallets.deployer, color: "#fff", key: "deployer" as const },
                    { label: "Agent Alpha", data: data.wallets.alpha, color: "#42BDFF", key: "alpha" as const },
                    { label: "Agent Omega", data: data.wallets.omega, color: "#42BDFF", key: "omega" as const },
                  ]).map((wallet) => {
                    const usdcBal = tokenBalances ? tokenBalances[wallet.key]?.usdc : null;
                    return (
                    <div
                      key={wallet.label}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "14px 16px",
                        borderRadius: "8px",
                        backgroundColor: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: wallet.color, marginBottom: "2px" }}>
                          {wallet.label}
                        </div>
                        <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}>
                          {truncate(wallet.data.address)}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <img src={SOL_LOGO_URL} alt="SOL" width={18} height={18} style={{ borderRadius: "50%" }} />
                          <span style={{ fontSize: "16px", fontWeight: 700, color: "#fff", fontFamily: "monospace" }}>
                            {wallet.data.balance.toFixed(4)}
                          </span>
                          <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>SOL</span>
                        </div>
                        <div style={{ width: "1px", height: "24px", backgroundColor: "rgba(255,255,255,0.1)" }} />
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <img src={USDC_LOGO_URL} alt="USDC" width={18} height={18} style={{ borderRadius: "50%" }} />
                          <span style={{ fontSize: "16px", fontWeight: 700, color: "#fff", fontFamily: "monospace" }}>
                            {usdcBal !== null && usdcBal !== undefined ? usdcBal.toFixed(2) : "..."}
                          </span>
                          <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>USDC</span>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>

              {/* Network info */}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.05em", padding: "0 4px" }}>
                <span>Network: Solana Devnet</span>
                <span>RPC: api.devnet.solana.com</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
