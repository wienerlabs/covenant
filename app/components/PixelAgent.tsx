"use client";

type AgentState = "idle" | "thinking" | "working" | "celebrating";

interface PixelAgentProps {
  seed: string;
  color: string;
  size?: number;
  state?: AgentState;
}

function hashSeed(seed: string): number[] {
  const nums: number[] = [];
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    nums.push(h);
  }
  while (nums.length < 28) {
    h = (h * 31 + 7) >>> 0;
    nums.push(h);
  }
  return nums;
}

const ANIMATIONS: Record<AgentState, string> = {
  idle: "",
  thinking: `
    @keyframes agent-pulse {
      0%, 100% { filter: drop-shadow(0 0 4px var(--agent-color)); }
      50% { filter: drop-shadow(0 0 12px var(--agent-color)) drop-shadow(0 0 20px var(--agent-color)); }
    }
  `,
  working: `
    @keyframes agent-bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-4px); }
    }
  `,
  celebrating: `
    @keyframes agent-celebrate {
      0% { transform: rotate(0deg) scale(1); }
      25% { transform: rotate(-3deg) scale(1.05); }
      50% { transform: rotate(3deg) scale(1.05); }
      75% { transform: rotate(-2deg) scale(1.02); }
      100% { transform: rotate(0deg) scale(1); }
    }
    @keyframes sparkle-spin {
      0% { transform: rotate(0deg); opacity: 1; }
      100% { transform: rotate(360deg); opacity: 0.6; }
    }
  `,
};

const ANIMATION_STYLES: Record<AgentState, React.CSSProperties> = {
  idle: {},
  thinking: {
    animation: "agent-pulse 1.5s ease-in-out infinite",
  },
  working: {
    animation: "agent-bounce 0.6s ease-in-out infinite",
  },
  celebrating: {
    animation: "agent-celebrate 0.8s ease-in-out infinite",
  },
};

export default function PixelAgent({
  seed,
  color,
  size = 64,
  state = "idle",
}: PixelAgentProps) {
  const hash = hashSeed(seed);
  const cellSize = size / 7;

  // Build a 7x7 grid, mirrored on x-axis (columns 0-3 mirrored to 6-3)
  const grid: boolean[][] = [];
  for (let row = 0; row < 7; row++) {
    const rowData: boolean[] = [];
    for (let col = 0; col < 4; col++) {
      const idx = row * 4 + col;
      const filled = hash[idx % hash.length] % 2 === 1;
      rowData.push(filled);
    }
    // Mirror: col4=col2, col5=col1, col6=col0
    rowData.push(rowData[2]);
    rowData.push(rowData[1]);
    rowData.push(rowData[0]);
    grid.push(rowData);
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <style>{ANIMATIONS[state]}</style>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{
          borderRadius: "10px",
          border: `2px solid ${color}40`,
          display: "block",
          boxShadow: `0 2px 8px ${color}30`,
          ...ANIMATION_STYLES[state],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ["--agent-color" as any]: color,
        }}
      >
        <rect width={size} height={size} fill="#1a1a2e" />
        {grid.map((row, ri) =>
          row.map((filled, ci) =>
            filled ? (
              <rect
                key={`${ri}-${ci}`}
                x={ci * cellSize}
                y={ri * cellSize}
                width={cellSize}
                height={cellSize}
                fill={color}
                rx={1}
              />
            ) : null
          )
        )}
      </svg>
      {state === "celebrating" && (
        <div
          style={{
            position: "absolute",
            inset: -8,
            animation: "sparkle-spin 2s linear infinite",
            pointerEvents: "none",
          }}
        >
          {[0, 60, 120, 180, 240, 300].map((deg) => (
            <div
              key={deg}
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: "4px",
                height: "4px",
                backgroundColor: color,
                borderRadius: "50%",
                transform: `rotate(${deg}deg) translate(${size / 2 + 6}px) rotate(-${deg}deg)`,
                boxShadow: `0 0 4px ${color}`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
