interface LoadingSkeletonProps {
  width?: string;
  height?: string;
  rounded?: boolean;
}

export default function LoadingSkeleton({
  width = "100%",
  height = "20px",
  rounded = false,
}: LoadingSkeletonProps) {
  return (
    <div
      className="shimmer"
      style={{
        width,
        height,
        borderRadius: rounded ? "50%" : "4px",
      }}
    />
  );
}

/**
 * A card-shaped loading skeleton for job lists.
 */
export function JobCardSkeleton() {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: "10px",
        padding: "20px",
        backgroundColor: "rgba(0,0,0,0.25)",
        backdropFilter: "blur(12px)",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div className="shimmer" style={{ width: "70px", height: "20px", borderRadius: "4px" }} />
        <div className="shimmer" style={{ width: "90px", height: "20px", borderRadius: "6px" }} />
      </div>
      <div className="shimmer" style={{ width: "60%", height: "24px", borderRadius: "4px" }} />
      <div style={{ display: "flex", gap: "20px" }}>
        <div className="shimmer" style={{ width: "80px", height: "14px", borderRadius: "4px" }} />
        <div className="shimmer" style={{ width: "80px", height: "14px", borderRadius: "4px" }} />
        <div className="shimmer" style={{ width: "100px", height: "14px", borderRadius: "4px" }} />
      </div>
    </div>
  );
}

/**
 * A stats card loading skeleton.
 */
export function StatCardSkeleton() {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: "12px",
        padding: "20px",
        backgroundColor: "rgba(0,0,0,0.3)",
        backdropFilter: "blur(12px)",
        textAlign: "center",
      }}
    >
      <div className="shimmer" style={{ width: "60%", height: "24px", borderRadius: "4px", margin: "0 auto 8px" }} />
      <div className="shimmer" style={{ width: "40%", height: "12px", borderRadius: "4px", margin: "0 auto" }} />
    </div>
  );
}

/**
 * A profile header loading skeleton.
 */
export function ProfileSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
      <div className="shimmer" style={{ width: "96px", height: "96px", borderRadius: "50%" }} />
      <div className="shimmer" style={{ width: "180px", height: "28px", borderRadius: "4px" }} />
      <div className="shimmer" style={{ width: "320px", height: "14px", borderRadius: "4px" }} />
      <div className="shimmer" style={{ width: "60px", height: "20px", borderRadius: "6px" }} />
    </div>
  );
}
