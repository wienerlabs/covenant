"use client";

import { useEffect, useState } from "react";

interface ChallengeCountdownProps {
  /** Target unix ms (Date.getTime()) after which the challenge period expires. */
  endAt: number;
  /** Called once when the countdown reaches zero. */
  onExpire?: () => void;
  /** Render variant — light or dark theme affects colors. */
  variant?: "light" | "dark";
  /** Label displayed above the countdown. */
  label?: string;
}

/**
 * Live countdown for the challenge period. Updates every 1s.
 *
 * When the deadline passes the display flips to "Ready to finalize" and
 * calls `onExpire` once (the consumer typically uses this to enable a
 * "Finalize now" button).
 */
export default function ChallengeCountdown({
  endAt,
  onExpire,
  variant = "light",
  label = "Auto-finalizes in",
}: ChallengeCountdownProps) {
  const [now, setNow] = useState(() => Date.now());
  const [expired, setExpired] = useState(() => Date.now() >= endAt);

  useEffect(() => {
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (!expired && current >= endAt) {
        setExpired(true);
        onExpire?.();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endAt, expired, onExpire]);

  const remaining = Math.max(0, endAt - now);
  const { hh, mm, ss } = formatRemaining(remaining);

  const isDark = variant === "dark";
  const textColor = expired
    ? "#1E9E5F"
    : isDark
      ? "#FFE342"
      : "#000000";
  const labelColor = isDark ? "rgba(255,255,255,0.5)" : "#666666";
  const borderColor = isDark
    ? "rgba(255,255,255,0.1)"
    : "rgba(0,0,0,0.1)";

  return (
    <div
      style={{
        padding: "16px 20px",
        border: `1px solid ${borderColor}`,
        borderRadius: "8px",
        backgroundColor: isDark
          ? "rgba(255,255,255,0.02)"
          : "rgba(0,0,0,0.02)",
        display: "inline-flex",
        flexDirection: "column",
        gap: "8px",
        minWidth: "220px",
      }}
    >
      <div
        style={{
          fontSize: "10px",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: labelColor,
        }}
      >
        {expired ? "Challenge period over" : label}
      </div>
      <div
        style={{
          fontFamily: "ui-monospace, monospace",
          fontSize: "24px",
          fontWeight: 700,
          color: textColor,
          letterSpacing: "0.04em",
        }}
      >
        {expired ? "READY TO FINALIZE" : `${hh}:${mm}:${ss}`}
      </div>
    </div>
  );
}

function formatRemaining(ms: number): { hh: string; mm: string; ss: string } {
  const totalSec = Math.floor(ms / 1000);
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  return {
    hh: String(hh).padStart(2, "0"),
    mm: String(mm).padStart(2, "0"),
    ss: String(ss).padStart(2, "0"),
  };
}
