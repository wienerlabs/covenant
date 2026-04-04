"use client";

import { useState, useRef, useEffect } from "react";
import useNotifications from "@/hooks/useNotifications";
import type { NotificationItem } from "@/hooks/useNotifications";

interface NotificationBellProps {
  wallet: string;
  variant?: "light" | "dark";
}

function getTypeIcon(type: string): { symbol: string; color: string } {
  switch (type) {
    case "job_accepted":
      return { symbol: "\u2192", color: "#4ade80" };
    case "job_completed":
      return { symbol: "\u2713", color: "#4ade80" };
    case "job_cancelled":
      return { symbol: "\u2717", color: "#f87171" };
    case "job_created":
      return { symbol: "+", color: "#60a5fa" };
    default:
      return { symbol: "\u2022", color: "#888" };
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationBell({ wallet, variant = "dark" }: NotificationBellProps) {
  const isDark = variant === "dark";
  const { notifications, unreadCount } = useNotifications({ wallet });
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          position: "relative",
          background: "none",
          border: isDark ? "1px solid rgba(255,255,255,0.15)" : "1px solid #e0e0e0",
          borderRadius: "6px",
          padding: "4px 8px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: isDark ? "rgba(255,255,255,0.7)" : "#555",
          fontSize: "16px",
          lineHeight: 1,
          transition: "all 0.15s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = isDark ? "rgba(255,255,255,0.4)" : "#000";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = isDark ? "rgba(255,255,255,0.15)" : "#e0e0e0";
        }}
        aria-label="Notifications"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: "-4px",
              right: "-4px",
              backgroundColor: "#FF425E",
              color: "#ffffff",
              fontSize: "9px",
              fontWeight: 700,
              minWidth: "14px",
              height: "14px",
              borderRadius: "7px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 3px",
              lineHeight: 1,
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: "300px",
            maxHeight: "300px",
            overflowY: "auto",
            borderRadius: "10px",
            border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid #e0e0e0",
            backgroundColor: isDark ? "rgba(20,20,20,0.95)" : "rgba(255,255,255,0.95)",
            backdropFilter: "blur(16px)",
            zIndex: 1100,
            padding: "8px 0",
            boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
          }}
        >
          {notifications.length === 0 ? (
            <div
              style={{
                padding: "24px 16px",
                textAlign: "center",
                fontSize: "11px",
                color: isDark ? "rgba(255,255,255,0.4)" : "#999",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              No notifications yet
            </div>
          ) : (
            notifications.map((n: NotificationItem) => {
              const icon = getTypeIcon(n.type);
              return (
                <div
                  key={n.id}
                  style={{
                    display: "flex",
                    gap: "10px",
                    padding: "10px 14px",
                    alignItems: "flex-start",
                    borderBottom: isDark
                      ? "1px solid rgba(255,255,255,0.06)"
                      : "1px solid #f0f0f0",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = isDark
                      ? "rgba(255,255,255,0.05)"
                      : "rgba(0,0,0,0.03)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: 700,
                      color: icon.color,
                      flexShrink: 0,
                      width: "18px",
                      textAlign: "center",
                      lineHeight: "18px",
                    }}
                  >
                    {icon.symbol}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "11px",
                        color: isDark ? "rgba(255,255,255,0.85)" : "#333",
                        lineHeight: "1.4",
                        wordBreak: "break-word",
                      }}
                    >
                      {n.message}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        marginTop: "4px",
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "9px",
                          color: isDark ? "rgba(255,255,255,0.35)" : "#999",
                          textTransform: "uppercase",
                          letterSpacing: "0.03em",
                        }}
                      >
                        {timeAgo(n.createdAt)}
                      </span>
                      {n.txHash && (
                        <a
                          href={`https://explorer.solana.com/tx/${n.txHash}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: "9px",
                            color: "#60a5fa",
                            textDecoration: "none",
                          }}
                        >
                          tx: {n.txHash.slice(0, 6)}...
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
