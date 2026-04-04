"use client";

import { useState, useEffect } from "react";
import UserAvatar from "./UserAvatar";
import { SOL_LOGO_URL } from "@/lib/constants";

interface FeedItem {
  text: string;
  txHash: string | null;
  status: "created" | "accepted" | "completed" | "cancelled";
  avatarSeed: string;
  relativeTime: string;
}

function parseItem(raw: { text: string; txHash: string | null }): FeedItem {
  let status: FeedItem["status"] = "created";
  if (raw.text.includes("COMPLETE") || raw.text.includes("VERIFIED") || raw.text.includes("RELEASED")) {
    status = "completed";
  } else if (raw.text.includes("ACCEPTED")) {
    status = "accepted";
  } else if (raw.text.includes("CANCELLED")) {
    status = "cancelled";
  }

  // Derive avatar seed from any wallet-like substring or just use text hash
  const walletMatch = raw.text.match(/[A-Za-z0-9]{4}\.\.\.[A-Za-z0-9]{4}/);
  const avatarSeed = walletMatch ? walletMatch[0] : raw.text.slice(0, 12);

  return {
    text: raw.text,
    txHash: raw.txHash,
    status,
    avatarSeed,
    relativeTime: "just now",
  };
}

export default function LiveFeed() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchFeed() {
      try {
        const res = await fetch("/api/activity");
        if (res.ok) {
          const data = await res.json();
          if (data.items && data.items.length > 0) {
            setItems(data.items.slice(0, 8).map((item: { text: string; txHash: string | null }) => parseItem(item)));
          }
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    fetchFeed();
    const poll = setInterval(fetchFeed, 8000);
    return () => clearInterval(poll);
  }, []);

  const statusColor = (status: FeedItem["status"]) => {
    switch (status) {
      case "completed": return "#FFE342";
      case "accepted": return "#42BDFF";
      case "cancelled": return "#fca5a5";
      default: return "rgba(255,255,255,0.7)";
    }
  };

  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: "12px",
        backgroundColor: "rgba(0,0,0,0.35)",
        backdropFilter: "blur(16px)",
        width: "100%",
        maxWidth: "380px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "#ffffff",
            fontWeight: 600,
          }}
        >
          LIVE ACTIVITY
        </span>
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            backgroundColor: "#FFE342",
            display: "inline-block",
            boxShadow: "0 0 6px #FFE342",
            animation: "pulse 2s infinite",
          }}
        />
      </div>

      <div
        style={{
          maxHeight: "300px",
          overflowY: "auto",
          padding: "8px 0",
        }}
      >
        {loading && (
          <div style={{ padding: "24px 16px", textAlign: "center", fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>
            Loading feed...
          </div>
        )}

        {!loading && items.length === 0 && (
          <div style={{ padding: "24px 16px", textAlign: "center", fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>
            No activity yet
          </div>
        )}

        {items.map((item, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: "10px",
              padding: "8px 16px",
              alignItems: "flex-start",
              transition: "background 0.15s ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
          >
            <div style={{ flexShrink: 0, marginTop: "2px" }}>
              <UserAvatar seed={item.avatarSeed} avatarUrl={null} size={28} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: "11px",
                  color: statusColor(item.status),
                  lineHeight: 1.4,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {item.text}
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "2px" }}>
                <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.3)" }}>
                  {item.relativeTime}
                </span>
                {item.txHash && (
                  <a
                    href={`https://explorer.solana.com/tx/${item.txHash}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: "9px",
                      color: "#5ba4f5",
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "2px",
                    }}
                  >
                    <img src={SOL_LOGO_URL} alt="SOL" width={8} height={8} style={{ borderRadius: "50%" }} />
                    tx
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
