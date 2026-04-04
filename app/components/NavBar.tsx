"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useConnector } from "@solana/connector/react";
import useProfile from "@/hooks/useProfile";
import WalletButton from "./WalletButton";
import WalletBalance from "./WalletBalance";
import PixelAvatar from "./PixelAvatar";
import NotificationBell from "./NotificationBell";
import ThemeToggle from "./ThemeToggle";

type Tab = "home" | "agents" | "poster" | "taker" | "dashboard" | "arena" | "leaderboard" | "proof" | "architecture" | "events" | "admin" | "onchain" | "disputes" | "faucet" | "api-docs";

interface NavBarProps {
  activeTab: Tab;
  variant?: "light" | "dark" | "transparent";
}

const PRIMARY_TABS: { id: Tab; label: string; href: string }[] = [
  { id: "home", label: "Home", href: "/" },
  { id: "agents", label: "Agents", href: "/agents" },
  { id: "poster", label: "Post a Job", href: "/poster" },
  { id: "taker", label: "Find Work", href: "/taker" },
  { id: "dashboard", label: "Dashboard", href: "/dashboard" },
  { id: "arena", label: "Arena", href: "/arena" },
];

const MORE_TABS: { id: Tab; label: string; href: string }[] = [
  { id: "proof", label: "ZK Proof", href: "/proof" },
  { id: "events", label: "Events", href: "/events" },
  { id: "onchain", label: "On-Chain", href: "/onchain" },
  { id: "faucet", label: "Faucet", href: "/faucet" },
  { id: "leaderboard", label: "Leaderboard", href: "/leaderboard" },
  { id: "disputes", label: "Disputes", href: "/disputes" },
  { id: "architecture", label: "Architecture", href: "/architecture" },
  { id: "admin", label: "DB Explorer", href: "/admin" },
  { id: "api-docs", label: "API", href: "/api-docs" },
];

export default function NavBar({ activeTab, variant = "light" }: NavBarProps) {
  const isDark = variant === "dark" || variant === "transparent";
  const isTransparent = variant === "transparent";
  const { isConnected, account } = useConnector();
  const { profile } = useProfile(isConnected && account ? account : undefined);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Filter out "home" tab on the landing page (transparent variant)
  const visibleTabs = isTransparent ? PRIMARY_TABS.filter(t => t.id !== "home") : PRIMARY_TABS;

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const isMoreActive = MORE_TABS.some(t => t.id === activeTab);

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
        position: "relative",
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

        {/* More dropdown */}
        <div ref={moreRef} style={{ position: "relative" }}>
          <button
            onClick={() => setMoreOpen(!moreOpen)}
            style={{
              fontFamily: "inherit",
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: isMoreActive
                ? (isDark ? "#ffffff" : "#000000")
                : (isDark ? "rgba(255,255,255,0.4)" : "#999999"),
              borderBottom: isMoreActive
                ? `2px solid ${isDark ? "#ffffff" : "#000000"}`
                : "2px solid transparent",
              paddingBottom: "4px",
              transition: "all 0.15s ease",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            More
            <span style={{
              fontSize: "8px",
              transform: moreOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.15s ease",
            }}>
              &#9660;
            </span>
          </button>

          {moreOpen && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                marginTop: "8px",
                minWidth: "180px",
                backgroundColor: isDark ? "rgba(20, 20, 30, 0.95)" : "#ffffff",
                border: isDark ? "1px solid rgba(255,255,255,0.15)" : "1px solid #e0e0e0",
                borderRadius: "8px",
                backdropFilter: "blur(16px)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                zIndex: 100,
                overflow: "hidden",
              }}
            >
              {MORE_TABS.map((tab) => (
                <Link
                  key={tab.id}
                  href={tab.href}
                  onClick={() => setMoreOpen(false)}
                  style={{
                    display: "block",
                    padding: "10px 16px",
                    fontSize: "11px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    textDecoration: "none",
                    color: activeTab === tab.id
                      ? (isDark ? "#ffffff" : "#000000")
                      : (isDark ? "rgba(255,255,255,0.6)" : "#666666"),
                    backgroundColor: activeTab === tab.id
                      ? (isDark ? "rgba(255,255,255,0.1)" : "#f5f5f5")
                      : "transparent",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (activeTab !== tab.id) {
                      e.currentTarget.style.backgroundColor = isDark ? "rgba(255,255,255,0.07)" : "#f9f9f9";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeTab !== tab.id) {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }
                  }}
                >
                  {tab.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mobile hamburger */}
      <button
        className="nav-mobile-hamburger"
        onClick={() => setMobileOpen(!mobileOpen)}
        style={{
          display: "none",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: isDark ? "#ffffff" : "#000000",
          fontSize: "18px",
          padding: "4px",
        }}
      >
        {mobileOpen ? "\u2715" : "\u2630"}
      </button>

      {/* Mobile menu overlay */}
      {mobileOpen && (
        <div
          className="nav-mobile-menu"
          style={{
            position: "fixed",
            top: "48px",
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: isDark ? "rgba(10,10,20,0.98)" : "rgba(255,255,255,0.98)",
            backdropFilter: "blur(16px)",
            zIndex: 200,
            display: "flex",
            flexDirection: "column",
            padding: "24px",
            gap: "4px",
            overflowY: "auto",
          }}
        >
          {[...PRIMARY_TABS, ...MORE_TABS].map((tab) => (
            <Link
              key={tab.id}
              href={tab.href}
              onClick={() => setMobileOpen(false)}
              style={{
                padding: "12px 16px",
                fontSize: "13px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                textDecoration: "none",
                color: activeTab === tab.id
                  ? (isDark ? "#ffffff" : "#000000")
                  : (isDark ? "rgba(255,255,255,0.5)" : "#999"),
                borderRadius: "8px",
                backgroundColor: activeTab === tab.id
                  ? (isDark ? "rgba(255,255,255,0.1)" : "#f0f0f0")
                  : "transparent",
              }}
            >
              {tab.label}
            </Link>
          ))}
          <div style={{ marginTop: "16px" }}>
            <WalletButton />
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
        <span
          style={{
            fontSize: "9px",
            color: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)",
            border: isDark ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(0,0,0,0.15)",
            borderRadius: "4px",
            padding: "2px 6px",
            cursor: "default",
            letterSpacing: "0.05em",
          }}
          title="Command Palette"
        >
          {"\u2318"}K
        </span>
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
          <WalletBalance />
        )}
        {isConnected && account && (
          <NotificationBell wallet={account} variant={isDark ? "dark" : "light"} />
        )}
        <ThemeToggle />
        <WalletButton />
      </div>
    </nav>
  );
}
