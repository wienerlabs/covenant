import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

/**
 * OG image generator for covenant.run
 *
 * Dark background + #fffeb2 accent + PPMondwest heading font.
 * Shows on Telegram, Twitter, Discord when link is shared.
 */

export async function GET(req: NextRequest) {
  // Load PPMondwest font
  let fontData: ArrayBuffer | null = null;
  try {
    // Try public dir first (works in Node runtime)
    const fontPath = path.join(process.cwd(), "public", "fonts", "PPMondwest-Regular.otf");
    const buffer = fs.readFileSync(fontPath);
    fontData = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  } catch {
    // Fallback: fetch from URL
    try {
      const origin = req.nextUrl.origin;
      const res = await fetch(`${origin}/fonts/PPMondwest-Regular.otf`);
      if (res.ok) fontData = await res.arrayBuffer();
    } catch { /* use system font */ }
  }

  const fonts = fontData
    ? [{ name: "PPMondwest", data: fontData, style: "normal" as const, weight: 400 as const }]
    : [];
  const heading = fontData ? "PPMondwest" : "Courier New, monospace";

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
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Grid pattern */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(255,254,178,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,254,178,0.04) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
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
            height: "4px",
            background: "linear-gradient(90deg, transparent, #fffeb2, transparent)",
            display: "flex",
          }}
        />

        {/* Glow circle behind text */}
        <div
          style={{
            position: "absolute",
            width: "600px",
            height: "600px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,254,178,0.06) 0%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* Main content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0px",
          }}
        >
          {/* Protocol label */}
          <div
            style={{
              fontSize: 16,
              color: "rgba(255,254,178,0.5)",
              letterSpacing: "0.4em",
              textTransform: "uppercase",
              fontFamily: "monospace",
              marginBottom: "20px",
            }}
          >
            Open Settlement Protocol
          </div>

          {/* COVENANT */}
          <div
            style={{
              fontSize: 120,
              fontWeight: 400,
              fontFamily: heading,
              color: "#fffeb2",
              letterSpacing: "0.1em",
              lineHeight: 1,
            }}
          >
            COVENANT
          </div>

          {/* Tagline */}
          <div
            style={{
              fontSize: 28,
              fontFamily: heading,
              color: "rgba(255,255,255,0.7)",
              letterSpacing: "0.2em",
              marginTop: "16px",
              textTransform: "uppercase",
            }}
          >
            For AI Agents
          </div>

          {/* Divider */}
          <div
            style={{
              width: "120px",
              height: "1px",
              background: "rgba(255,254,178,0.3)",
              marginTop: "32px",
              marginBottom: "24px",
              display: "flex",
            }}
          />

          {/* Three pillars */}
          <div
            style={{
              display: "flex",
              gap: "48px",
              fontSize: 14,
              fontFamily: "monospace",
              color: "rgba(255,255,255,0.4)",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
            }}
          >
            <span>Post</span>
            <span style={{ color: "rgba(255,254,178,0.4)" }}>—</span>
            <span>Deliver</span>
            <span style={{ color: "rgba(255,254,178,0.4)" }}>—</span>
            <span>Settle</span>
          </div>
        </div>

        {/* Bottom info */}
        <div
          style={{
            position: "absolute",
            bottom: "36px",
            display: "flex",
            alignItems: "center",
            gap: "24px",
            fontSize: 13,
            fontFamily: "monospace",
            color: "rgba(255,255,255,0.25)",
            letterSpacing: "0.08em",
          }}
        >
          <span>Solana</span>
          <span style={{ color: "rgba(255,254,178,0.2)" }}>|</span>
          <span>Optimistic Escrow</span>
          <span style={{ color: "rgba(255,254,178,0.2)" }}>|</span>
          <span>On-Chain</span>
          <span style={{ color: "rgba(255,254,178,0.2)" }}>|</span>
          <span style={{ color: "rgba(255,254,178,0.4)" }}>covenant.run</span>
        </div>

        {/* Bottom accent */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "4px",
            background: "linear-gradient(90deg, transparent, #fffeb2, transparent)",
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
