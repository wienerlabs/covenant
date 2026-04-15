"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface FloatingReaction {
  id: number;
  emoji: string;
  x: number;
  startTime: number;
}

const REACTIONS = [
  { emoji: "\u{1F525}", label: "Fire" },
  { emoji: "\u{1F44F}", label: "Clap" },
  { emoji: "\u{1F929}", label: "Wow" },
  { emoji: "\u2694\uFE0F", label: "Fight" },
  { emoji: "\u{1F4A5}", label: "Boom" },
];

export default function BattleReactions() {
  const [floating, setFloating] = useState<FloatingReaction[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const nextId = useRef(0);

  // Clean up old reactions
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setFloating((prev) => prev.filter((r) => now - r.startTime < 2500));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const handleReaction = useCallback((emoji: string) => {
    const id = nextId.current++;
    const x = 10 + Math.random() * 80; // random horizontal position (10-90%)

    setFloating((prev) => [...prev.slice(-20), { id, emoji, x, startTime: Date.now() }]);
    setCounts((prev) => ({ ...prev, [emoji]: (prev[emoji] || 0) + 1 }));
  }, []);

  return (
    <div style={{ position: "relative" }}>
      {/* Floating reactions */}
      <div
        style={{
          position: "absolute",
          bottom: "100%",
          left: 0,
          right: 0,
          height: "200px",
          pointerEvents: "none",
          overflow: "hidden",
        }}
      >
        {floating.map((r) => {
          const age = (Date.now() - r.startTime) / 2500;
          return (
            <div
              key={r.id}
              style={{
                position: "absolute",
                left: `${r.x}%`,
                bottom: `${age * 100}%`,
                fontSize: "28px",
                opacity: 1 - age,
                transform: `scale(${1 - age * 0.3})`,
                transition: "none",
                pointerEvents: "none",
              }}
            >
              {r.emoji}
            </div>
          );
        })}
      </div>

      {/* Reaction buttons */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        {REACTIONS.map((r) => (
          <button
            key={r.emoji}
            onClick={() => handleReaction(r.emoji)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 16px",
              borderRadius: "20px",
              border: "1px solid rgba(255,255,255,0.12)",
              backgroundColor: "rgba(255,255,255,0.05)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "14px",
              color: "rgba(255,255,255,0.7)",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(255,254,178,0.1)";
              e.currentTarget.style.borderColor = "rgba(255,254,178,0.3)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
            }}
          >
            <span style={{ fontSize: "18px" }}>{r.emoji}</span>
            {counts[r.emoji] ? (
              <span style={{ fontSize: "12px", color: "#fffeb2", fontWeight: 600, fontFamily: "inherit" }}>
                {counts[r.emoji]}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
