interface StatusBadgeProps {
  status: "Open" | "Accepted" | "Completed" | "Cancelled";
}

const statusStyles: Record<
  StatusBadgeProps["status"],
  { bg: string; color: string; borderColor: string; prefix: string }
> = {
  Open: { bg: "#ffffff", color: "#000000", borderColor: "#000000", prefix: "" },
  Accepted: { bg: "#000000", color: "#ffffff", borderColor: "#000000", prefix: "" },
  Completed: { bg: "#000000", color: "#ffffff", borderColor: "#000000", prefix: "✓ " },
  Cancelled: { bg: "#ffffff", color: "#999999", borderColor: "#999999", prefix: "" },
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const s = statusStyles[status];

  return (
    <span
      style={{
        display: "inline-block",
        border: `1px solid ${s.borderColor}`,
        borderRadius: "4px",
        padding: "2px 8px",
        fontSize: "10px",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        backgroundColor: s.bg,
        color: s.color,
        fontFamily: "inherit",
        lineHeight: 1.4,
      }}
    >
      {s.prefix}
      {status}
    </span>
  );
}
