"use client";

const PALETTE = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FFEAA7",
  "#DDA0DD",
  "#98D8C8",
  "#F7DC6F",
  "#BB8FCE",
  "#85C1E9",
];

function hashSeed(seed: string): number[] {
  const nums: number[] = [];
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    nums.push(h);
  }
  // Ensure we have at least 15 values for the 3x5 half-grid
  while (nums.length < 20) {
    h = (h * 31 + 7) >>> 0;
    nums.push(h);
  }
  return nums;
}

interface PixelAvatarProps {
  seed: string;
  size?: number;
}

export default function PixelAvatar({ seed, size = 48 }: PixelAvatarProps) {
  const hash = hashSeed(seed);
  const colorIndex = hash[0] % PALETTE.length;
  const fg = PALETTE[colorIndex];
  const cellSize = size / 5;

  // Build a 5x5 grid, mirrored on x-axis (columns 0,1,2 -> mirrored to 4,3)
  const grid: boolean[][] = [];
  for (let row = 0; row < 5; row++) {
    const rowData: boolean[] = [];
    for (let col = 0; col < 3; col++) {
      const idx = row * 3 + col;
      const filled = hash[idx % hash.length] % 2 === 1;
      rowData.push(filled);
    }
    // Mirror: col3 = col1, col4 = col0
    rowData.push(rowData[1]);
    rowData.push(rowData[0]);
    grid.push(rowData);
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ borderRadius: "8px", border: "1px solid rgba(0,0,0,0.15)", display: "block", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}
    >
      <rect width={size} height={size} fill="#f0f0f0" />
      {grid.map((row, ri) =>
        row.map((filled, ci) =>
          filled ? (
            <rect
              key={`${ri}-${ci}`}
              x={ci * cellSize}
              y={ri * cellSize}
              width={cellSize}
              height={cellSize}
              fill={fg}
            />
          ) : null
        )
      )}
    </svg>
  );
}
