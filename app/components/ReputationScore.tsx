"use client";

import { useState, useEffect } from "react";

interface ReputationScoreProps {
  completed: number;
  failed: number;
}

export default function ReputationScore({
  completed,
  failed,
}: ReputationScoreProps) {
  const [animatedScore, setAnimatedScore] = useState(0);

  const total = completed + failed;
  const score = total > 0 ? Math.round((completed / total) * 100) : 0;

  const color =
    score > 80 ? "#10B981" : score >= 50 ? "#eab308" : "#ef4444";

  // SVG ring parameters
  const size = 80;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (animatedScore / 100) * circumference;

  useEffect(() => {
    // Animate from 0 to score on mount
    let frame: number;
    const start = performance.now();
    const duration = 800;

    function animate(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(Math.round(score * eased));
      if (progress < 1) {
        frame = requestAnimationFrame(animate);
      }
    }

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [score]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "6px",
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: "rotate(-90deg)" }}
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 0.1s ease-out" }}
        />
      </svg>
      {/* Score number (overlaid) */}
      <div
        style={{
          position: "relative",
          marginTop: -size + (size / 2 - 10),
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: size,
        }}
      >
        <span
          style={{
            fontSize: "22px",
            fontWeight: 700,
            color: color,
          }}
        >
          {total > 0 ? animatedScore : "--"}
        </span>
      </div>
      <div
        style={{
          fontSize: "8px",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: "rgba(255,255,255,0.4)",
          fontWeight: 600,
          marginTop: "-4px",
        }}
      >
        REPUTATION SCORE
      </div>
    </div>
  );
}
