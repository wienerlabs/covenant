"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);

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
            color: "rgba(255,100,100,0.7)",
            marginBottom: "16px",
          }}
        >
          Error
        </div>
        <h1
          style={{
            fontSize: "28px",
            fontWeight: 700,
            color: "#fff",
            margin: "0 0 16px 0",
            textTransform: "uppercase",
          }}
        >
          Something went wrong
        </h1>
        {error?.message && (
          <p
            style={{
              fontSize: "13px",
              color: "rgba(255,255,255,0.5)",
              marginBottom: "32px",
              lineHeight: 1.6,
              wordBreak: "break-word",
            }}
          >
            {error.message}
          </p>
        )}
        <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
          <button
            onClick={reset}
            style={{
              fontFamily: "inherit",
              fontSize: "12px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              padding: "10px 24px",
              cursor: "pointer",
              border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: "6px",
              backgroundColor: "rgba(255,255,255,0.1)",
              color: "#fff",
              transition: "all 0.15s ease",
            }}
          >
            Try Again
          </button>
          <Link
            href="/"
            style={{
              fontFamily: "inherit",
              fontSize: "12px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              padding: "10px 24px",
              cursor: "pointer",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "6px",
              backgroundColor: "transparent",
              color: "rgba(255,255,255,0.6)",
              textDecoration: "none",
              transition: "all 0.15s ease",
              display: "inline-block",
            }}
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
