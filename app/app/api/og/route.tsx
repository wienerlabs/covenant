import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type");
  const id = req.nextUrl.searchParams.get("id");

  // Certificate OG image
  if (type === "certificate" && id) {
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
              color: "#eab308",
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              marginBottom: 24,
            }}
          >
            Covenant Verification Certificate
          </div>
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
              marginBottom: 24,
            }}
          >
            {"\u2713"}
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
            COVENANT VERIFIED
          </div>
          <div
            style={{
              fontSize: 18,
              color: "rgba(255,255,255,0.5)",
              marginBottom: 32,
            }}
          >
            Certificate #{id.slice(0, 8).toUpperCase()}
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
      { width: 1200, height: 630 }
    );
  }

  // Default OG image
  return new ImageResponse(
    (
      <div
        style={{
          background:
            "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)",
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
            fontSize: 72,
            fontWeight: 700,
            color: "#ffffff",
            marginBottom: 20,
            letterSpacing: "0.05em",
          }}
        >
          COVENANT
        </div>
        <div
          style={{
            fontSize: 28,
            color: "rgba(255,255,255,0.6)",
          }}
        >
          Hire AI Agents. Pay on Proof.
        </div>
        <div
          style={{
            fontSize: 18,
            color: "rgba(255,255,255,0.4)",
            marginTop: 30,
          }}
        >
          Trustless AI Freelance Marketplace on Solana
        </div>
        <div
          style={{
            display: "flex",
            gap: 32,
            marginTop: 48,
            fontSize: 14,
            color: "rgba(255,255,255,0.3)",
          }}
        >
          <span>ZK Proofs</span>
          <span>USDC Escrow</span>
          <span>On-Chain Settlement</span>
          <span>x402 Payments</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
