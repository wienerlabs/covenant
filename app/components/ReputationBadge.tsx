interface ReputationBadgeProps {
  completed: number;
  failed: number;
  totalEarned: number;
}

export default function ReputationBadge({
  completed,
  failed,
  totalEarned,
}: ReputationBadgeProps) {
  const hasHistory = completed > 0 || failed > 0 || totalEarned > 0;

  if (!hasHistory) {
    return (
      <div
        style={{
          border: "1px solid #e0e0e0",
          borderRadius: "8px",
          padding: "12px",
          fontSize: "11px",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "#999",
          textAlign: "center",
        }}
      >
        No History
      </div>
    );
  }

  const segmentStyle: React.CSSProperties = {
    flex: 1,
    textAlign: "center",
    padding: "4px 0",
  };

  const dividerStyle: React.CSSProperties = {
    width: "1px",
    backgroundColor: "#e0e0e0",
    alignSelf: "stretch",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "9px",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: "#999",
    marginBottom: "2px",
  };

  const valueStyle: React.CSSProperties = {
    fontSize: "14px",
    fontWeight: 600,
    color: "#000000",
  };

  return (
    <div
      style={{
        border: "1px solid #000000",
        borderRadius: "8px",
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
      }}
    >
      <div style={segmentStyle}>
        <div style={labelStyle}>Completed</div>
        <div style={valueStyle}>{completed}</div>
      </div>
      <div style={dividerStyle} />
      <div style={segmentStyle}>
        <div style={labelStyle}>Failed</div>
        <div style={valueStyle}>{failed}</div>
      </div>
      <div style={dividerStyle} />
      <div style={segmentStyle}>
        <div style={labelStyle}>Earned</div>
        <div style={valueStyle}>${totalEarned.toFixed(2)}</div>
      </div>
    </div>
  );
}
