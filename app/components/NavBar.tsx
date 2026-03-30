"use client";

import Link from "next/link";
import WalletButton from "./WalletButton";

interface NavBarProps {
  activeTab: "poster" | "taker";
}

export default function NavBar({ activeTab }: NavBarProps) {
  const tabStyle = (tab: "poster" | "taker"): React.CSSProperties => ({
    fontFamily: "inherit",
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    textDecoration: "none",
    color: activeTab === tab ? "#000000" : "#999999",
    borderBottom: activeTab === tab ? "2px solid #000000" : "2px solid transparent",
    paddingBottom: "4px",
    transition: "all 0.15s ease",
  });

  return (
    <nav
      style={{
        height: "48px",
        borderBottom: "1px solid #000000",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        backgroundColor: "#ffffff",
      }}
    >
      <Link
        href="/"
        style={{
          fontSize: "11px",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          textDecoration: "none",
          color: "#000000",
          fontWeight: 700,
        }}
      >
        Covenant
      </Link>

      <div style={{ display: "flex", gap: "32px", alignItems: "center" }}>
        <Link href="/poster" style={tabStyle("poster")}>
          Post a Job
        </Link>
        <Link href="/taker" style={tabStyle("taker")}>
          Find Work
        </Link>
      </div>

      <WalletButton />
    </nav>
  );
}
