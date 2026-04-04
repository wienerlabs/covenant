"use client";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    fontFamily: "inherit",
    fontSize: "10px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    padding: "6px 14px",
    cursor: disabled ? "not-allowed" : "pointer",
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: "6px",
    backgroundColor: disabled ? "transparent" : "rgba(255,255,255,0.08)",
    color: disabled ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.7)",
    backdropFilter: "blur(8px)",
    transition: "all 0.15s ease",
    opacity: disabled ? 0.5 : 1,
  });

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: "12px",
        marginTop: "24px",
        padding: "12px 0",
      }}
    >
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        style={btnStyle(page <= 1)}
      >
        &laquo; Prev
      </button>
      <span
        style={{
          fontSize: "11px",
          color: "rgba(255,255,255,0.5)",
          padding: "4px 12px",
          borderRadius: "6px",
          border: "1px solid rgba(255,255,255,0.12)",
          backgroundColor: "rgba(255,255,255,0.05)",
          backdropFilter: "blur(8px)",
        }}
      >
        Page {page} of {totalPages}
      </span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        style={btnStyle(page >= totalPages)}
      >
        Next &raquo;
      </button>
    </div>
  );
}
