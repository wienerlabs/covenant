"use client";

import Link from "next/link";
import { useConnector } from "@solana/connector/react";
import useProfile from "@/hooks/useProfile";
import WalletButton from "./WalletButton";
import PixelAvatar from "./PixelAvatar";
import NotificationBell from "./NotificationBell";

type Tab = "home" | "poster" | "taker" | "leaderboard" | "arena" | "proof" | "architecture" | "admin";

interface NavBarProps {
  activeTab: Tab;
  variant?: "light" | "dark" | "transparent";
}

const TABS: { id: Tab; label: string; href: string }[] = [
  { id: "home", label: "Home", href: "/" },
  { id: "poster", label: "Post a Job", href: "/poster" },
  { id: "taker", label: "Find Work", href: "/taker" },
  { id: "leaderboard", label: "Ranks", href: "/leaderboard" },
  { id: "arena", label: "Arena", href: "/arena" },
  { id: "proof", label: "ZK Proof", href: "/proof" },
  { id: "architecture", label: "Arch", href: "/architecture" },
  { id: "admin", label: "DB", href: "/admin" },
];

export default function NavBar({ activeTab, variant = "light" }: NavBarProps) {
  const isDark = variant === "dark" || variant === "transparent";
  const isTransparent = variant === "transparent";
  const { isConnected, account } = useConnector();
  const { profile } = useProfile(isConnected && account ? account : undefined);

  // Filter out "home" tab on the landing page (transparent variant)
  const visibleTabs = isTransparent ? TABS.filter(t => t.id !== "home") : TABS;

  const tabStyle = (tab: Tab): React.CSSProperties => ({
    fontFamily: "inherit",
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    textDecoration: "none",
    color: activeTab === tab
      ? (isDark ? "#ffffff" : "#000000")
      : (isDark ? "rgba(255,255,255,0.4)" : "#999999"),
    borderBottom: activeTab === tab
      ? `2px solid ${isDark ? "#ffffff" : "#000000"}`
      : "2px solid transparent",
    paddingBottom: "4px",
    transition: "all 0.15s ease",
  });

  return (
    <nav
      style={{
        height: "48px",
        borderBottom: isTransparent ? "none" : (isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid #000000"),
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: isTransparent ? "0 40px" : "0 24px",
        backgroundColor: "transparent",
      }}
    >
      <Link
        href="/"
        style={{
          fontSize: "11px",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          textDecoration: "none",
          color: isDark ? "#ffffff" : "#000000",
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        Covenant
      </Link>

      <div className="nav-tabs" style={{ display: "flex", gap: "20px", alignItems: "center" }}>
        {visibleTabs.map((tab) => (
          <Link key={tab.id} href={tab.href} style={tabStyle(tab.id)}>
            {tab.label}
          </Link>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
        {isConnected && profile && (
          <Link
            href="/profile"
            style={{
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "4px 10px",
              borderRadius: "6px",
              border: isDark ? "1px solid rgba(255,255,255,0.15)" : "1px solid #e0e0e0",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = isDark ? "rgba(255,255,255,0.4)" : "#000";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = isDark ? "rgba(255,255,255,0.15)" : "#e0e0e0";
            }}
          >
            <PixelAvatar seed={profile.avatarSeed} size={24} />
            <span style={{
              fontSize: "10px",
              color: isDark ? "rgba(255,255,255,0.7)" : "#555",
              maxWidth: "70px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {profile.displayName}
            </span>
          </Link>
        )}
        {isConnected && account && (
          <NotificationBell wallet={account} variant={isDark ? "dark" : "light"} />
        )}
        <WalletButton />
      </div>
    </nav>
  );
}
