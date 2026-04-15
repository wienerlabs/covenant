import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import { join } from "path";

export async function GET() {
  // Load PPMondwest font — Node runtime (not edge) so fs works
  let fontData: ArrayBuffer;
  try {
    const fontPath = join(process.cwd(), "app", "fonts", "PPMondwest-Regular.otf");
    const buffer = await readFile(fontPath);
    fontData = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  } catch {
    // If font fails, return without custom font
    return new ImageResponse(
      (
        <div style={{ background: "#0a0a0f", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace" }}>
          <div style={{ fontSize: 112, fontWeight: 700, color: "#fffeb2", letterSpacing: 14 }}>COVENANT</div>
        </div>
      ),
      { width: 1200, height: 630 },
    );
  }

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
        }}
      >
        <div
          style={{
            fontSize: 16,
            fontFamily: "monospace",
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
            fontSize: 120,
            fontFamily: "PPMondwest",
            color: "#fffeb2",
            letterSpacing: 12,
            lineHeight: 1,
          }}
        >
          COVENANT
        </div>

        <div
          style={{
            fontSize: 28,
            fontFamily: "PPMondwest",
            color: "#ffffffaa",
            letterSpacing: 10,
            marginTop: 20,
            textTransform: "uppercase",
          }}
        >
          For AI Agents
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
            fontFamily: "monospace",
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
            fontFamily: "monospace",
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
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: "PPMondwest",
          data: fontData,
          style: "normal",
          weight: 400,
        },
      ],
    },
  );
}
