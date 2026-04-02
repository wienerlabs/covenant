"use client";

import { useState } from "react";
import NavBar from "@/components/NavBar";
import { USDC_LOGO_URL } from "@/lib/constants";

export default function FaucetPage() {
  const [wallet, setWallet] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success?: boolean;
    txHash?: string;
    balance?: number;
    error?: string;
  } | null>(null);

  async function handleFaucet() {
    if (!wallet.trim()) return;
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: wallet.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ success: true, txHash: data.txHash, balance: data.balance });
      } else {
        setResult({ error: data.error || "Faucet request failed" });
      }
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : "Network error" });
    } finally {
      setLoading(false);
    }
  }

  const glassCard: React.CSSProperties = {
    backgroundColor: "rgba(255,255,255,0.07)",
    backdropFilter: "blur(16px)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "10px",
    padding: "32px",
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
        }}
      />
      <div style={{ position: "fixed", inset: 0, zIndex: 1, backgroundColor: "rgba(0,0,0,0.6)" }} />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 2 }}>
        <NavBar activeTab="onchain" variant="dark" />

        <div style={{ maxWidth: "560px", margin: "0 auto", padding: "48px 24px" }}>
          <h1
            style={{
              fontSize: "28px",
              fontWeight: 700,
              color: "#fff",
              textTransform: "uppercase",
              letterSpacing: "-0.01em",
              margin: "0 0 4px 0",
              textAlign: "center",
            }}
          >
            Test USDC Faucet
          </h1>
          <p
            style={{
              fontSize: "13px",
              color: "rgba(255,255,255,0.5)",
              margin: "0 0 32px 0",
              textAlign: "center",
            }}
          >
            Get 100 test USDC on Solana devnet. Rate limited to once per hour per wallet.
          </p>

          <div style={glassCard}>
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "rgba(255,255,255,0.4)",
                  marginBottom: "8px",
                }}
              >
                Wallet Address
              </label>
              <input
                type="text"
                placeholder="Enter your Solana wallet address..."
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  fontSize: "13px",
                  fontFamily: "monospace",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: "6px",
                  color: "#fff",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <button
              onClick={handleFaucet}
              disabled={loading || !wallet.trim()}
              style={{
                width: "100%",
                padding: "14px",
                fontSize: "13px",
                fontFamily: "inherit",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                fontWeight: 600,
                cursor: loading || !wallet.trim() ? "not-allowed" : "pointer",
                border: "1px solid #ffffff",
                borderRadius: "6px",
                backgroundColor: loading ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.1)",
                color: loading || !wallet.trim() ? "rgba(255,255,255,0.3)" : "#ffffff",
                transition: "all 0.2s ease",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              <img src={USDC_LOGO_URL} alt="USDC" width={18} height={18} style={{ borderRadius: "50%" }} />
              {loading ? "Minting..." : "Get 100 Test USDC"}
            </button>

            {/* Result */}
            {result && (
              <div
                style={{
                  marginTop: "20px",
                  padding: "16px",
                  borderRadius: "8px",
                  backgroundColor: result.success
                    ? "rgba(134,239,172,0.1)"
                    : "rgba(255,95,87,0.1)",
                  border: result.success
                    ? "1px solid rgba(134,239,172,0.3)"
                    : "1px solid rgba(255,95,87,0.3)",
                }}
              >
                {result.success ? (
                  <>
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "#86efac",
                        marginBottom: "8px",
                      }}
                    >
                      100 Test USDC minted successfully!
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "rgba(255,255,255,0.6)",
                        marginBottom: "4px",
                      }}
                    >
                      TX Hash:
                    </div>
                    <a
                      href={`https://explorer.solana.com/tx/${result.txHash}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: "11px",
                        fontFamily: "monospace",
                        color: "#3B82F6",
                        textDecoration: "none",
                        wordBreak: "break-all",
                      }}
                    >
                      {result.txHash}
                    </a>
                    {typeof result.balance === "number" && (
                      <div
                        style={{
                          marginTop: "12px",
                          fontSize: "11px",
                          color: "rgba(255,255,255,0.5)",
                        }}
                      >
                        New Balance:{" "}
                        <span style={{ color: "#fff", fontWeight: 600 }}>
                          {result.balance.toFixed(2)} USDC
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: "12px", color: "#fca5a5" }}>
                    {result.error}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Info */}
          <div
            style={{
              marginTop: "24px",
              fontSize: "10px",
              color: "rgba(255,255,255,0.3)",
              textAlign: "center",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              lineHeight: 1.8,
            }}
          >
            <div>Mint: F7RYRq...pqYueQ (Test USDC, 6 decimals)</div>
            <div>Network: Solana Devnet</div>
          </div>
        </div>
      </div>
    </div>
  );
}
