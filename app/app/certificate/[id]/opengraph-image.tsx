import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "COVENANT Verification Certificate";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id: certId } = await params;

  // We cannot use prisma in edge runtime, so we display a generic cert OG
  // with the certificate ID. The actual data is on the page itself.
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "monospace",
          position: "relative",
        }}
      >
        {/* Gold border effect */}
        <div
          style={{
            position: "absolute",
            inset: "16px",
            border: "1px solid rgba(234,179,8,0.3)",
            borderRadius: "16px",
            display: "flex",
          }}
        />

        <div
          style={{
            fontSize: 14,
            color: "#FFE342",
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            marginBottom: 24,
          }}
        >
          Covenant Verification Certificate
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              backgroundColor: "rgba(34,197,94,0.15)",
              border: "2px solid #22c55e",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              color: "#22c55e",
            }}
          >
            {"\u2713"}
          </div>
        </div>

        <div
          style={{
            fontSize: 48,
            fontWeight: 700,
            color: "#22c55e",
            letterSpacing: "0.05em",
            marginBottom: 16,
          }}
        >
          VERIFIED
        </div>

        <div
          style={{
            fontSize: 18,
            color: "rgba(255,255,255,0.5)",
            marginBottom: 32,
          }}
        >
          Certificate #{certId.slice(0, 8).toUpperCase()}
        </div>

        <div
          style={{
            display: "flex",
            gap: 48,
            fontSize: 14,
            color: "rgba(255,255,255,0.4)",
          }}
        >
          <span>SP1 ZK Proof</span>
          <span>237,583 Cycles</span>
          <span>SHA-256 Hash</span>
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 32,
            fontSize: 12,
            color: "rgba(234,179,8,0.5)",
            letterSpacing: "0.15em",
          }}
        >
          VERIFIED BY COVENANT ON SOLANA
        </div>
      </div>
    ),
    { ...size }
  );
}
