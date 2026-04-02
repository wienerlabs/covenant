"use client";

import { useState, useEffect, useCallback } from "react";

interface TickerTx {
  txHash: string;
  status: string;
  createdAt: string;
}

function truncateHash(hash: string): string {
  if (hash.length < 10) return hash;
  return `${hash.slice(0, 4)}...${hash.slice(-4)}`;
}

function relativeTime(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function TransactionTicker() {
  const [transactions, setTransactions] = useState<TickerTx[]>([]);

  const fetchTransactions = useCallback(async () => {
    try {
      const res = await fetch("/api/transactions?limit=10");
      if (res.ok) {
        const data = await res.json();
        const txs = Array.isArray(data) ? data : data.transactions || [];
        setTransactions(txs.slice(0, 10));
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchTransactions();
    const interval = setInterval(fetchTransactions, 10000);
    return () => clearInterval(interval);
  }, [fetchTransactions]);

  if (transactions.length === 0) return null;

  const tickerText = transactions
    .map(
      (tx) =>
        `TX ${truncateHash(tx.txHash)} → ${tx.status} ${relativeTime(tx.createdAt)}`
    )
    .join("  •  ");

  // Double the text for seamless looping
  const doubledText = `${tickerText}  •  ${tickerText}`;

  return (
    <>
      <style>{`
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: "32px",
          backgroundColor: "rgba(0,0,0,0.8)",
          backdropFilter: "blur(8px)",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          zIndex: 9997,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "inline-block",
            whiteSpace: "nowrap",
            animation: `ticker-scroll ${Math.max(20, transactions.length * 4)}s linear infinite`,
          }}
        >
          {doubledText.split("  •  ").map((segment, i) => {
            const hashMatch = segment.match(/TX (\S+)/);
            const fullHash = hashMatch
              ? transactions.find(
                  (tx) => truncateHash(tx.txHash) === hashMatch[1]
                )?.txHash
              : null;

            return (
              <span key={i} style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>
                {i > 0 && (
                  <span style={{ margin: "0 8px", color: "rgba(255,255,255,0.2)" }}>
                    •
                  </span>
                )}
                {fullHash ? (
                  <a
                    href={`https://explorer.solana.com/tx/${fullHash}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "rgba(255,255,255,0.5)",
                      textDecoration: "none",
                      transition: "color 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "#5ba4f5";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "rgba(255,255,255,0.5)";
                    }}
                  >
                    {segment}
                  </a>
                ) : (
                  segment
                )}
              </span>
            );
          })}
        </div>
      </div>
    </>
  );
}
