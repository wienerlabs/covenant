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

  const size = 64;
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? animatedScore / 100 : 0;
  const dashOffset = circumference * (1 - progress);

  useEffect(() => {
    if (total === 0) return;
    let frame: number;
    const start = performance.now();
    const duration = 800;

    function animate(now: number) {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimatedScore(Math.round(score * eased));
      if (t < 1) frame = requestAnimationFrame(animate);
    }

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [score, total]);

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={strokeWidth}
        />
        {/* Progress ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={total > 0 ? color : "rgba(255,255,255,0.15)"}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={`${dashOffset}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.15s ease-out" }}
        />
      </svg>
      {/* Center text */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontSize: "18px",
            fontWeight: 700,
            color: total > 0 ? color : "rgba(255,255,255,0.3)",
          }}
        >
          {total > 0 ? animatedScore : "—"}
        </span>
      </div>
    </div>
  );
}
