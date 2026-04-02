import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
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
