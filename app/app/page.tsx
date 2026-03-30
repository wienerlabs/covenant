"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import WalletButton from "@/components/WalletButton";
import AsciiAnimation from "@/components/AsciiAnimation";

const TICKER_ITEMS = [
  "JOB #0x3a1f CREATED -- 500 USDC",
  "JOB #0x8b2c ACCEPTED BY 7KjN...WxYz",
  "PROOF VERIFIED -- JOB #0x5e4d COMPLETE",
  "JOB #0x1f9a CREATED -- 1,200 USDC",
  "PAYOUT RELEASED -- 750 USDC TO 4LkO...XyZa",
  "JOB #0x7c3b ACCEPTED BY 9WzD...AWWM",
];

export default function LandingPage() {
  const [tickerIndex, setTickerIndex] = useState(0);
  const [primaryHover, setPrimaryHover] = useState(false);
  const [ghostHover, setGhostHover] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setTickerIndex((prev) => (prev + 1) % TICKER_ITEMS.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "inherit",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "24px 32px",
        }}
      >
        <span
          style={{
            fontSize: "11px",
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            fontWeight: 700,
          }}
        >
          Covenant
        </span>
        <WalletButton />
      </div>

      {/* Center content */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 32px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "80px",
            maxWidth: "1100px",
            width: "100%",
            alignItems: "center",
          }}
        >
          {/* Left column */}
          <div>
            <h1
              style={{
                fontSize: "52px",
                fontWeight: 700,
                lineHeight: 1.05,
                margin: "0 0 24px 0",
                textTransform: "uppercase",
                letterSpacing: "-0.02em",
              }}
            >
              Trustless
              <br />
              Work
              <br />
              Delivery
            </h1>
            <p
              style={{
                fontSize: "14px",
                color: "#555555",
                lineHeight: 1.6,
                margin: "0 0 32px 0",
                maxWidth: "400px",
              }}
            >
              Post jobs with escrowed USDC. Workers submit deliverables with
              zero-knowledge word-count proofs. Funds release automatically when
              the proof verifies on-chain. No trust required.
            </p>
            <div style={{ display: "flex", gap: "12px" }}>
              <Link href="/poster" style={{ textDecoration: "none" }}>
                <button
                  onMouseEnter={() => setPrimaryHover(true)}
                  onMouseLeave={() => setPrimaryHover(false)}
                  style={{
                    fontFamily: "inherit",
                    fontSize: "13px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    padding: "8px 20px",
                    cursor: "pointer",
                    border: "1px solid #000000",
                    borderRadius: "6px",
                    backgroundColor: primaryHover ? "#ffffff" : "#000000",
                    color: primaryHover ? "#000000" : "#ffffff",
                    transition: "all 0.15s ease",
                  }}
                >
                  Post a Job
                </button>
              </Link>
              <Link href="/taker" style={{ textDecoration: "none" }}>
                <button
                  onMouseEnter={() => setGhostHover(true)}
                  onMouseLeave={() => setGhostHover(false)}
                  style={{
                    fontFamily: "inherit",
                    fontSize: "13px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    padding: "8px 20px",
                    cursor: "pointer",
                    border: "1px solid #000000",
                    borderRadius: "6px",
                    backgroundColor: ghostHover ? "#000000" : "#ffffff",
                    color: ghostHover ? "#ffffff" : "#000000",
                    transition: "all 0.15s ease",
                  }}
                >
                  Find Work
                </button>
              </Link>
            </div>
          </div>

          {/* Right column */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: "16px",
            }}
          >
            <AsciiAnimation scene="handshake" />
            <div
              style={{
                border: "1px solid #000000",
                borderRadius: "8px",
                padding: "8px 16px",
                fontSize: "11px",
                fontFamily: "inherit",
                width: "280px",
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                color: "#555555",
              }}
            >
              <span style={{ color: "#000000", fontWeight: 600, marginRight: "8px" }}>
                LIVE
              </span>
              {TICKER_ITEMS[tickerIndex]}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          borderTop: "1px solid #000000",
          padding: "16px 32px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: "10px", color: "#555555", textTransform: "uppercase" }}>
          Built on Solana
        </span>
        <span style={{ fontSize: "10px", color: "#555555", textTransform: "uppercase" }}>
          Devnet
        </span>
        <span style={{ fontSize: "10px", color: "#555555", textTransform: "uppercase" }}>
          Trustless Escrow Protocol
        </span>
      </div>
    </div>
  );
}
