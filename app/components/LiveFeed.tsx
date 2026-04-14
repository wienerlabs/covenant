"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActivityItem {
  id: string;
  type: "job_event" | "achievement" | "arena_battle" | "transaction";
  message: string;
  wallet?: string;
  amount?: number;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Dot color by event type */
function dotColor(type: ActivityItem["type"]): string {
  switch (type) {
    case "job_event":
      return "#fffeb2";
    case "achievement":
      return "#a78bfa";
    case "arena_battle":
      return "#FF425E";
    case "transaction":
      return "#1E9E5F";
    default:
      return "rgba(255,255,255,0.7)";
  }
}

/** Badge label by event type */
function badgeLabel(type: ActivityItem["type"]): string {
  switch (type) {
    case "job_event":
      return "JOB";
    case "achievement":
      return "ACHIEVEMENT";
    case "arena_battle":
      return "ARENA";
    case "transaction":
      return "TX";
    default:
      return "EVENT";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LiveFeed() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchFeed = useCallback(async () => {
    try {
      const res = await fetch("/api/activity/recent");
      if (res.ok) {
        const data = await res.json();
        if (data.items) {
          setItems(data.items);
        }
      }
    } catch {
      // silent — keep last data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed();
    const poll = setInterval(fetchFeed, 10_000);
    return () => clearInterval(poll);
  }, [fetchFeed]);

  // Auto-scroll to top when new items arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [items]);

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
      {/* Header */}
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
            fontSize: "12px",
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
            backgroundColor: "#fffeb2",
            display: "inline-block",
            boxShadow: "0 0 6px #fffeb2",
            animation: "pulse 2s infinite",
          }}
        />
      </div>

      {/* Scrollable body */}
      <div
        ref={scrollRef}
        style={{
          maxHeight: "340px",
          overflowY: "auto",
          padding: "4px 0",
        }}
      >
        {loading && (
          <div
            style={{
              padding: "24px 16px",
              textAlign: "center",
              fontSize: "12px",
              color: "rgba(255,255,255,0.4)",
            }}
          >
            Loading feed...
          </div>
        )}

        {!loading && items.length === 0 && (
          <div
            style={{
              padding: "24px 16px",
              textAlign: "center",
              fontSize: "12px",
              color: "rgba(255,255,255,0.4)",
            }}
          >
            No activity yet
          </div>
        )}

        {items.map((item) => (
          <div
            key={item.id}
            style={{
              display: "flex",
              gap: "10px",
              padding: "8px 16px",
              alignItems: "flex-start",
              transition: "background 0.15s ease",
              cursor: "default",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            {/* Colored dot + optional star for achievements */}
            <div
              style={{
                flexShrink: 0,
                marginTop: "4px",
                display: "flex",
                alignItems: "center",
                gap: "3px",
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: dotColor(item.type),
                  display: "inline-block",
                  boxShadow: `0 0 6px ${dotColor(item.type)}`,
                }}
              />
              {item.type === "achievement" && (
                <span
                  style={{
                    fontSize: "12px",
                    lineHeight: 1,
                    color: "#a78bfa",
                  }}
                >
                  &#9733;
                </span>
              )}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Badge pill + relative time */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  marginBottom: "2px",
                }}
              >
                <span
                  style={{
                    fontSize: "9px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: dotColor(item.type),
                    backgroundColor: `${dotColor(item.type)}18`,
                    padding: "1px 6px",
                    borderRadius: "9999px",
                    lineHeight: "16px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {badgeLabel(item.type)}
                </span>
                <span
                  style={{
                    fontSize: "12px",
                    color: "rgba(255,255,255,0.3)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {relativeTime(item.timestamp)}
                </span>
              </div>

              {/* Message */}
              <div
                style={{
                  fontSize: "12px",
                  color: "rgba(255,255,255,0.85)",
                  lineHeight: 1.4,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {item.message}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
