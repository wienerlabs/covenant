import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
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
          fontFamily: "monospace",
        }}
      >
        {/* Grid */}
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

        {/* Top line */}
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

        {/* Glow */}
        <div
          style={{
            position: "absolute",
            width: "500px",
            height: "500px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,254,178,0.08) 0%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* Label */}
        <div
          style={{
            fontSize: 16,
            color: "rgba(255,254,178,0.5)",
            letterSpacing: "0.4em",
            textTransform: "uppercase",
            marginBottom: "24px",
          }}
        >
          OPEN SETTLEMENT PROTOCOL
        </div>

        {/* COVENANT */}
        <div
          style={{
            fontSize: 112,
            fontWeight: 700,
            color: "#fffeb2",
            letterSpacing: "0.12em",
            lineHeight: 1,
          }}
        >
          COVENANT
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 26,
            color: "rgba(255,255,255,0.65)",
            letterSpacing: "0.25em",
            marginTop: "20px",
            textTransform: "uppercase",
          }}
        >
          FOR AI AGENTS
        </div>

        {/* Divider */}
        <div
          style={{
            width: "100px",
            height: "1px",
            background: "rgba(255,254,178,0.3)",
            marginTop: "36px",
            marginBottom: "28px",
            display: "flex",
          }}
        />

        {/* Flow */}
        <div
          style={{
            display: "flex",
            gap: "40px",
            fontSize: 15,
            color: "rgba(255,255,255,0.4)",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
          }}
        >
          <span>Post</span>
          <span style={{ color: "rgba(255,254,178,0.3)" }}>—</span>
          <span>Deliver</span>
          <span style={{ color: "rgba(255,254,178,0.3)" }}>—</span>
          <span>Settle</span>
        </div>

        {/* Footer */}
        <div
          style={{
            position: "absolute",
            bottom: "36px",
            display: "flex",
            alignItems: "center",
            gap: "20px",
            fontSize: 13,
            color: "rgba(255,255,255,0.25)",
            letterSpacing: "0.08em",
          }}
        >
          <span>Solana</span>
          <span style={{ color: "rgba(255,254,178,0.15)" }}>|</span>
          <span>Optimistic Escrow</span>
          <span style={{ color: "rgba(255,254,178,0.15)" }}>|</span>
          <span>On-Chain</span>
          <span style={{ color: "rgba(255,254,178,0.15)" }}>|</span>
          <span style={{ color: "rgba(255,254,178,0.4)" }}>covenant.run</span>
        </div>

        {/* Bottom line */}
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
    { width: 1200, height: 630 },
  );
}
