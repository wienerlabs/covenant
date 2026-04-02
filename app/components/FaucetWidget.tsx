"use client";

import { useState, useEffect, useCallback } from "react";
import { useConnector } from "@solana/connector/react";

export default function FaucetWidget() {
  const { isConnected, account } = useConnector();
  const [expanded, setExpanded] = useState(false);
  const [minting, setMinting] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!account) return;
    try {
      const res = await fetch(`/api/balance/${account}`);
      if (res.ok) {
        const data = await res.json();
        setBalance(data.balance ?? data.usdcBalance ?? null);
      }
    } catch {
      // silently fail
    }
  }, [account]);

  useEffect(() => {
    if (isConnected && account) {
      fetchBalance();
    }
  }, [isConnected, account, fetchBalance]);

  async function handleMint() {
    if (!account) return;
    setMinting(true);
    setError(null);
    setTxHash(null);
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: account }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Mint failed");
        return;
      }
      const data = await res.json();
      setTxHash(data.txHash || null);
      fetchBalance();
    } catch {
      setError("Network error");
    } finally {
      setMinting(false);
    }
  }

  if (!isConnected || !account) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "44px",
        right: "16px",
        zIndex: 9998,
        fontFamily: "inherit",
      }}
    >
      {expanded ? (
        <div
          style={{
            backgroundColor: "rgba(10,10,20,0.85)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: "12px",
            padding: "16px",
            width: "240px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
            }}
          >
            <span
              style={{
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "rgba(255,255,255,0.5)",
                fontWeight: 600,
              }}
            >
              USDC Faucet
            </span>
            <button
              onClick={() => setExpanded(false)}
              style={{
                background: "none",
                border: "none",
                color: "rgba(255,255,255,0.4)",
                cursor: "pointer",
                fontSize: "14px",
                padding: "0 4px",
              }}
            >
              x
            </button>
          </div>

          {balance !== null && (
            <div
              style={{
                fontSize: "11px",
                color: "rgba(255,255,255,0.6)",
                marginBottom: "10px",
              }}
            >
              Balance:{" "}
              <span style={{ fontWeight: 700, color: "#ffffff" }}>
                {balance.toFixed(2)} USDC
              </span>
            </div>
          )}

          <div
            style={{
              fontSize: "10px",
              color: "rgba(255,255,255,0.35)",
              marginBottom: "8px",
              fontFamily: "monospace",
              wordBreak: "break-all",
            }}
          >
            {account.slice(0, 8)}...{account.slice(-6)}
          </div>

          <button
            onClick={handleMint}
            disabled={minting}
            style={{
              width: "100%",
              fontFamily: "inherit",
              fontSize: "12px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              padding: "10px",
              cursor: minting ? "wait" : "pointer",
              border: "1px solid rgba(255,255,255,0.25)",
              borderRadius: "6px",
              backgroundColor: minting
                ? "rgba(255,255,255,0.05)"
                : "rgba(255,255,255,0.1)",
              color: minting ? "rgba(255,255,255,0.4)" : "#ffffff",
              fontWeight: 600,
              transition: "all 0.15s ease",
              marginBottom: "8px",
            }}
          >
            {minting ? "Minting..." : "Mint 100 USDC"}
          </button>

          {txHash && (
            <div style={{ fontSize: "10px", color: "#86efac", wordBreak: "break-all" }}>
              Success!{" "}
              <a
                href={`https://explorer.solana.com/tx/${txHash}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#5ba4f5", textDecoration: "none" }}
              >
                {txHash.slice(0, 12)}...
              </a>
            </div>
          )}

          {error && (
            <div style={{ fontSize: "10px", color: "#fca5a5" }}>{error}</div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setExpanded(true)}
          style={{
            fontFamily: "inherit",
            fontSize: "11px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            padding: "8px 16px",
            cursor: "pointer",
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: "20px",
            backgroundColor: "rgba(10,10,20,0.8)",
            backdropFilter: "blur(12px)",
            color: "rgba(255,255,255,0.7)",
            transition: "all 0.15s ease",
          }}
        >
          GET USDC
        </button>
      )}
    </div>
  );
}
