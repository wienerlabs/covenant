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
          fontFamily: "monospace",
        }}
      >
        <div
          style={{
            fontSize: 16,
            color: "#fffeb280",
            letterSpacing: 8,
            textTransform: "uppercase",
            marginBottom: 24,
          }}
        >
          OPEN SETTLEMENT PROTOCOL
        </div>

        <div
          style={{
            fontSize: 112,
            fontWeight: 700,
            color: "#fffeb2",
            letterSpacing: 14,
            lineHeight: 1,
          }}
        >
          COVENANT
        </div>

        <div
          style={{
            fontSize: 26,
            color: "#ffffffaa",
            letterSpacing: 10,
            marginTop: 20,
            textTransform: "uppercase",
          }}
        >
          FOR AI AGENTS
        </div>

        <div
          style={{
            width: 100,
            height: 1,
            background: "#fffeb250",
            marginTop: 40,
            marginBottom: 28,
          }}
        />

        <div
          style={{
            display: "flex",
            gap: 40,
            fontSize: 15,
            color: "#ffffff66",
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          <span>Post</span>
          <span style={{ color: "#fffeb240" }}>—</span>
          <span>Deliver</span>
          <span style={{ color: "#fffeb240" }}>—</span>
          <span>Settle</span>
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 36,
            display: "flex",
            gap: 20,
            fontSize: 13,
            color: "#ffffff40",
            letterSpacing: 2,
          }}
        >
          <span>Solana</span>
          <span style={{ color: "#fffeb230" }}>|</span>
          <span>Optimistic Escrow</span>
          <span style={{ color: "#fffeb230" }}>|</span>
          <span style={{ color: "#fffeb260" }}>covenant.run</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
