import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Background */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          backgroundImage: "url('/poster-bg.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1,
          backgroundColor: "rgba(0,0,0,0.65)",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          textAlign: "center",
          padding: "48px 32px",
          maxWidth: "480px",
        }}
      >
        <div
          style={{
            fontSize: "11px",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "rgba(255,255,255,0.35)",
            marginBottom: "16px",
          }}
        >
          404
        </div>
        <h1
          style={{
            fontSize: "28px",
            fontWeight: 700,
            color: "#fff",
            margin: "0 0 16px 0",
            textTransform: "uppercase",
            letterSpacing: "-0.01em",
          }}
        >
          Page not found
        </h1>
        <p
          style={{
            fontSize: "13px",
            color: "rgba(255,255,255,0.45)",
            marginBottom: "36px",
            lineHeight: 1.6,
          }}
        >
          The page you are looking for does not exist or has been moved.
        </p>
        <Link
          href="/"
          style={{
            fontFamily: "inherit",
            fontSize: "12px",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            padding: "10px 28px",
            cursor: "pointer",
            border: "1px solid rgba(255,255,255,0.3)",
            borderRadius: "6px",
            backgroundColor: "rgba(255,255,255,0.1)",
            color: "#fff",
            textDecoration: "none",
            display: "inline-block",
            transition: "all 0.15s ease",
          }}
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
