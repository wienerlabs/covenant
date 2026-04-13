import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

/**
 * OG image generator for covenant.run
 *
 * Clean, minimal, brand-aligned. Dark background + #fffeb2 accent.
 * Loads PPMondwest font for the heading to match the site identity.
 */

export async function GET(req: NextRequest) {
  // Load PPMondwest font for headings
  let fontData: ArrayBuffer | null = null;
  try {
    const fontUrl = new URL("/fonts/PPMondwest-Regular.otf", req.url);
    const fontRes = await fetch(fontUrl);
    if (fontRes.ok) {
      fontData = await fontRes.arrayBuffer();
    }
  } catch {
    // Fallback to system font
  }

  const fonts = fontData
    ? [
        {
          name: "PPMondwest",
          data: fontData,
          style: "normal" as const,
          weight: 400 as const,
        },
      ]
    : [];

  const headingFont = fontData ? "PPMondwest" : "monospace";

  return new ImageResponse(
    (
      <div
        style={{
          background: "#0a0a0f",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "monospace",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle grid pattern */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(255,254,178,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,254,178,0.03) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            display: "flex",
          }}
        />

        {/* Top accent line */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "3px",
            background: "linear-gradient(90deg, transparent 0%, #fffeb2 50%, transparent 100%)",
            display: "flex",
          }}
        />

        {/* Main content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
          }}
        >
          {/* Protocol label */}
          <div
            style={{
              fontSize: 14,
              color: "rgba(255,254,178,0.6)",
              letterSpacing: "0.35em",
              textTransform: "uppercase",
              marginBottom: "12px",
            }}
          >
            Open Settlement Protocol
          </div>

          {/* COVENANT — main heading */}
          <div
            style={{
              fontSize: 96,
              fontWeight: 400,
              fontFamily: headingFont,
              color: "#fffeb2",
              letterSpacing: "0.08em",
              lineHeight: 1,
            }}
          >
            COVENANT
          </div>

          {/* Two-word tagline */}
          <div
            style={{
              fontSize: 32,
              fontWeight: 400,
              fontFamily: headingFont,
              color: "rgba(255,255,255,0.85)",
              letterSpacing: "0.15em",
              marginTop: "4px",
            }}
          >
            SETTLE AGENTS.
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            position: "absolute",
            bottom: "40px",
            display: "flex",
            alignItems: "center",
            gap: "32px",
            fontSize: 13,
            color: "rgba(255,255,255,0.3)",
            letterSpacing: "0.1em",
          }}
        >
          <span>Solana</span>
          <span style={{ color: "rgba(255,254,178,0.3)" }}>|</span>
          <span>Optimistic Escrow</span>
          <span style={{ color: "rgba(255,254,178,0.3)" }}>|</span>
          <span>On-Chain</span>
          <span style={{ color: "rgba(255,254,178,0.3)" }}>|</span>
          <span style={{ color: "rgba(255,254,178,0.5)" }}>covenant.run</span>
        </div>

        {/* Bottom accent line */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "3px",
            background: "linear-gradient(90deg, transparent 0%, #fffeb2 50%, transparent 100%)",
            display: "flex",
          }}
        />
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts,
    },
  );
}
