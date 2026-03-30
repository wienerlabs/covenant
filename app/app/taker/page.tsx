"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import NavBar from "@/components/NavBar";
import JobList from "@/components/JobList";
import ReputationBadge from "@/components/ReputationBadge";
import AsciiAnimation from "@/components/AsciiAnimation";
import useReputation from "@/hooks/useReputation";

export default function TakerPage() {
  const { publicKey } = useWallet();
  const walletPubkey = publicKey?.toBase58();
  const { reputation } = useReputation(walletPubkey);
  const [activeFilter, setActiveFilter] = useState<"all" | "mine">("all");
  const [allHover, setAllHover] = useState(false);
  const [mineHover, setMineHover] = useState(false);

  const filterBtnStyle = (
    isActive: boolean,
    isHovered: boolean
  ): React.CSSProperties => ({
    fontFamily: "inherit",
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    padding: "4px 16px",
    cursor: "pointer",
    border: "1px solid #000000",
    backgroundColor: isActive || isHovered ? "#000000" : "#ffffff",
    color: isActive || isHovered ? "#ffffff" : "#000000",
    transition: "all 0.15s ease",
  });

  return (
    <div style={{ minHeight: "100vh", fontFamily: "inherit" }}>
      <NavBar activeTab="taker" />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "65% 35%",
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "32px 24px",
          gap: "32px",
        }}
      >
        {/* Left column */}
        <div>
          <div
            style={{
              display: "flex",
              gap: "8px",
              marginBottom: "24px",
            }}
          >
            <button
              onClick={() => setActiveFilter("all")}
              onMouseEnter={() => setAllHover(true)}
              onMouseLeave={() => setAllHover(false)}
              style={filterBtnStyle(activeFilter === "all", allHover)}
            >
              All Jobs
            </button>
            <button
              onClick={() => setActiveFilter("mine")}
              onMouseEnter={() => setMineHover(true)}
              onMouseLeave={() => setMineHover(false)}
              style={filterBtnStyle(activeFilter === "mine", mineHover)}
            >
              My Jobs
            </button>
          </div>

          <JobList filter={activeFilter} walletPubkey={walletPubkey} />
        </div>

        {/* Right column - sticky sidebar */}
        <div>
          <div style={{ position: "sticky", top: "24px" }}>
            <div style={{ marginBottom: "24px" }}>
              <div
                style={{
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "#555555",
                  marginBottom: "8px",
                }}
              >
                Your Reputation
              </div>
              <ReputationBadge
                completed={reputation.completed}
                failed={reputation.failed}
                totalEarned={reputation.totalEarned}
              />
            </div>

            <div
              style={{
                border: "1px solid #e0e0e0",
                borderRadius: "10px",
                padding: "16px",
                marginBottom: "24px",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "#555555",
                  marginBottom: "12px",
                }}
              >
                Protocol Stats
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "12px",
                  }}
                >
                  <span style={{ color: "#555555" }}>Total Jobs</span>
                  <span style={{ fontWeight: 600 }}>247</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "12px",
                  }}
                >
                  <span style={{ color: "#555555" }}>Open Jobs</span>
                  <span style={{ fontWeight: 600 }}>18</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "12px",
                  }}
                >
                  <span style={{ color: "#555555" }}>Total Escrowed</span>
                  <span style={{ fontWeight: 600 }}>$42,850</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "12px",
                  }}
                >
                  <span style={{ color: "#555555" }}>Completion Rate</span>
                  <span style={{ fontWeight: 600 }}>94.2%</span>
                </div>
              </div>
            </div>

            <AsciiAnimation scene="idle" />
          </div>
        </div>
      </div>
    </div>
  );
}
