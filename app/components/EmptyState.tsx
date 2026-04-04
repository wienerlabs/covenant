"use client";

interface EmptyStateProps {
  title: string;
  subtitle: string;
  type: "jobs" | "transactions" | "history" | "disputes";
}

const ASCII_ART: Record<string, string> = {
  jobs: `
    +-----------+
    |           |
    |  (empty)  |
    |   inbox   |
    |           |
    +-----------+
  `,
  transactions: `
    [  ]--[  ]--[  ]
     |         |
    [ ]       [ ]
     |         |
    ...  no links  ...
  `,
  history: `
       .---.
      /     \\
     | 12  . |
     |  |/   |
      \\     /
       '---'
       . . .
  `,
  disputes: `
        ___
       / | \\
      /  |  \\
     /   |   \\
    /____|____\\
       / \\
      /   \\
     /_____\\
  `,
};

export default function EmptyState({ title, subtitle, type }: EmptyStateProps) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "48px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "12px",
      }}
    >
      <pre
        style={{
          fontSize: "10px",
          lineHeight: 1.3,
          color: "rgba(255,255,255,0.25)",
          fontFamily: "monospace",
          margin: 0,
          whiteSpace: "pre",
        }}
      >
        {ASCII_ART[type]}
      </pre>
      <div
        style={{
          fontSize: "13px",
          fontWeight: 700,
          color: "rgba(255,255,255,0.6)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: "11px",
          color: "rgba(255,255,255,0.35)",
          maxWidth: "300px",
        }}
      >
        {subtitle}
      </div>
    </div>
  );
}
