"use client";

/**
 * Root-level error boundary.
 *
 * Next.js renders this when an error escapes the root layout itself
 * (e.g. a Provider crashes during hydration, a font loader fails,
 * etc.). At this point the app shell isn't available, so we render
 * our own minimal `<html>` + `<body>` and avoid importing any heavy
 * client provider.
 *
 * This is intentionally separate from `app/error.tsx`, which only
 * catches errors *inside* the layout. Without `global-error.tsx`,
 * the layout-crash case falls back to Next's default white screen.
 */

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[global-error]", {
      message: error?.message,
      digest: error?.digest,
      stack: error?.stack?.split("\n").slice(0, 5).join("\n"),
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
          backgroundColor: "#08080d",
          color: "#ffffff",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <main
          style={{
            maxWidth: 480,
            padding: "48px 24px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.16em",
              color: "rgba(255,90,90,0.7)",
              marginBottom: 16,
            }}
          >
            Fatal Error
          </div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 700,
              margin: "0 0 16px 0",
              textTransform: "uppercase",
              letterSpacing: "-0.01em",
            }}
          >
            The app failed to start
          </h1>
          <p
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.5)",
              lineHeight: 1.6,
              marginBottom: 12,
              wordBreak: "break-word",
            }}
          >
            {error?.message || "An unexpected error occurred during page initialization."}
          </p>
          {error?.digest && (
            <p
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.3)",
                marginBottom: 32,
                fontFamily: "monospace",
              }}
            >
              Error ID: {error.digest}
            </p>
          )}
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={reset}
              style={{
                fontFamily: "inherit",
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                padding: "10px 24px",
                cursor: "pointer",
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: 6,
                backgroundColor: "rgba(255,255,255,0.1)",
                color: "#ffffff",
              }}
            >
              Try Again
            </button>
            <a
              href="/"
              style={{
                fontFamily: "inherit",
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                padding: "10px 24px",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 6,
                backgroundColor: "transparent",
                color: "rgba(255,255,255,0.6)",
                textDecoration: "none",
              }}
            >
              Go Home
            </a>
          </div>
          <p
            style={{
              marginTop: 36,
              fontSize: 11,
              color: "rgba(255,255,255,0.3)",
            }}
          >
            If this keeps happening, check{" "}
            <a
              href="/api/health"
              style={{ color: "rgba(255,255,255,0.5)", textDecoration: "underline" }}
            >
              /api/health
            </a>{" "}
            for service status.
          </p>
        </main>
      </body>
    </html>
  );
}
