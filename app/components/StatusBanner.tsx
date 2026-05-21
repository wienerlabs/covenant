"use client";

import { useEffect, useState } from "react";

interface StatusBannerProps {
  /**
   * Stable key used to remember per-incident dismissal in localStorage.
   * Bump this string when a NEW status condition needs to re-show the
   * banner to users who already dismissed the previous one.
   */
  storageKey: string;
  /** Short status line. Keep under ~120 chars; the banner is single line on desktop. */
  message: string;
}

/**
 * Thin top-of-page status banner. Sticky, glassy, brand-yellow accent,
 * dismissible per incident via localStorage. Renders nothing once the
 * user closes it, so we don't shove the same message in their face on
 * every reload.
 */
export default function StatusBanner({ storageKey, message }: StatusBannerProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const dismissed = window.localStorage.getItem(storageKey);
      if (dismissed !== "1") setVisible(true);
    } catch {
      // localStorage blocked (private mode, etc.) — still show the banner
      setVisible(true);
    }
  }, [storageKey]);

  function dismiss(): void {
    setVisible(false);
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      /* non-fatal */
    }
  }

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "relative",
        zIndex: 5,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "10px",
        padding: "8px 16px",
        backgroundColor: "rgba(255, 254, 178, 0.08)",
        borderBottom: "1px solid rgba(255, 254, 178, 0.22)",
        backdropFilter: "blur(10px)",
        fontSize: "11px",
        letterSpacing: "0.02em",
        color: "rgba(255, 254, 178, 0.95)",
        fontFamily: "inherit",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          backgroundColor: "#fffeb2",
          boxShadow: "0 0 8px rgba(255, 254, 178, 0.6)",
          animation: "covenant-status-pulse 1.8s ease-in-out infinite",
          flexShrink: 0,
        }}
      />
      <span style={{ flex: "0 1 auto", lineHeight: 1.4 }}>{message}</span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss notification"
        style={{
          marginLeft: "6px",
          background: "transparent",
          border: "1px solid rgba(255, 254, 178, 0.25)",
          borderRadius: "4px",
          color: "rgba(255, 254, 178, 0.85)",
          fontFamily: "inherit",
          fontSize: "10px",
          padding: "2px 6px",
          cursor: "pointer",
          lineHeight: 1,
          transition: "all 0.15s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "rgba(255, 254, 178, 0.12)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        ×
      </button>
      <style jsx>{`
        @keyframes covenant-status-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.55; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}
