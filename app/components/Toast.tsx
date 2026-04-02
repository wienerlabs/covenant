"use client";

import type { ToastItem } from "@/hooks/useToast";

const iconMap: Record<string, { symbol: string; color: string }> = {
  success: { symbol: "\u2713", color: "#86efac" },
  error: { symbol: "\u2717", color: "#fca5a5" },
  info: { symbol: "\u2139", color: "#93c5fd" },
};

interface ToastProps {
  item: ToastItem;
}

export default function Toast({ item }: ToastProps) {
  const icon = iconMap[item.type] || iconMap.info;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "12px 18px",
        borderRadius: "10px",
        backgroundColor: "rgba(20, 20, 30, 0.92)",
        border: "1px solid rgba(255,255,255,0.12)",
        backdropFilter: "blur(16px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        color: "rgba(255,255,255,0.85)",
        fontSize: "12px",
        minWidth: "240px",
        maxWidth: "360px",
        animation: "toast-slide-in 0.3s ease-out",
      }}
    >
      <span
        style={{
          fontSize: "16px",
          color: icon.color,
          flexShrink: 0,
          width: "20px",
          textAlign: "center",
        }}
      >
        {icon.symbol}
      </span>
      <span style={{ flex: 1 }}>{item.message}</span>
    </div>
  );
}
