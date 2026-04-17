"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useConnector } from "@solana/connector/react";
import useProfile from "@/hooks/useProfile";
import WalletButton from "./WalletButton";
import WalletBalance from "./WalletBalance";
import UserAvatar from "./UserAvatar";
import NotificationBell from "./NotificationBell";
// ThemeToggle removed — dark mode only

/**
 * Hover-prefetch: as soon as the user's cursor lands on a nav link, kick off
 * a warm fetch for that route's hero background. Combined with the immutable
 * Cache-Control headers from next.config.mjs, the image is already in disk
 * cache by the time Next.js renders the new page — so the cross-route
 * transition shows the background with zero perceivable delay.
 *
 * We only prefetch the WebP variant since every modern browser our target
 * (hackathon judges on macOS/Chrome/Safari 16+) speaks it. Legacy browsers
 * that don't support WebP fall back gracefully when the actual page loads
 * and CSS's `image-set()` picks the PNG.
 */
const ROUTE_BG_MAP: Partial<Record<Tab, string>> = {
  home: "/covenant-bg-poster.jpg",
  agents: "/poster-bg.webp",
  poster: "/poster-bg.webp",
  taker: "/poster-bg.webp",
  dashboard: "/poster-bg.webp",
  battle: "/arena-bg.webp",
  arena: "/arena-bg.webp",
  autonomous: "/poster-bg.webp",
  leaderboard: "/poster-bg.webp",
  architecture: "/poster-bg.webp",
  events: "/poster-bg.webp",
  admin: "/poster-bg.webp",
  onchain: "/poster-bg.webp",
  disputes: "/poster-bg.webp",
  faucet: "/poster-bg.webp",
  "api-docs": "/poster-bg.webp",
  integrate: "/poster-bg.webp",
  developers: "/poster-bg.webp",
};

// Module-scoped set so we only kick off each prefetch once per session.
const prefetchedBackgrounds = new Set<string>();
function prefetchBackground(href: string): void {
  if (typeof window === "undefined") return;
  if (prefetchedBackgrounds.has(href)) return;
  prefetchedBackgrounds.add(href);
  // Using Image() rather than <link rel="prefetch"> so we can fire it
  // synchronously from an event handler. The image enters the browser's
  // HTTP cache and subsequent CSS `background-image` references resolve
  // instantly.
  const img = new window.Image();
  img.decoding = "async";
  img.src = href;
}

type Tab = "home" | "agents" | "create" | "poster" | "taker" | "dashboard" | "battle" | "arena" | "autonomous" | "leaderboard" | "architecture" | "events" | "admin" | "onchain" | "disputes" | "faucet" | "api-docs" | "protocol" | "developers" | "integrate" | "profile" | "credit";

interface NavBarProps {
  activeTab: Tab;
  variant?: "light" | "dark" | "transparent";
}

// Home is reached by clicking the logo; we don't duplicate it as a tab.
const PRIMARY_TABS: { id: Tab; label: string; href: string }[] = [
  { id: "agents", label: "Agents", href: "/agents" },
  { id: "create", label: "Create Agent", href: "/agents/create" },
  { id: "poster", label: "Post a Job", href: "/poster" },
  { id: "taker", label: "Find Work", href: "/taker" },
  { id: "dashboard", label: "Dashboard", href: "/dashboard" },
  { id: "battle", label: "Battle", href: "/battle" },
  { id: "arena", label: "Arena", href: "/arena" },
  { id: "credit", label: "Credit", href: "/credit" },
];

const MORE_TABS: { id: Tab; label: string; href: string }[] = [
  { id: "autonomous", label: "Auto", href: "/autonomous" },
  { id: "developers", label: "Developers", href: "/developers" },
  { id: "integrate", label: "Integrate", href: "/integrate" },
  { id: "events", label: "Events", href: "/events" },
  { id: "onchain", label: "On-Chain", href: "/onchain" },
  { id: "faucet", label: "Faucet", href: "/faucet" },
  { id: "leaderboard", label: "Leaderboard", href: "/leaderboard" },
  { id: "disputes", label: "Disputes", href: "/disputes" },
  { id: "architecture", label: "Architecture", href: "/architecture" },
  { id: "admin", label: "DB Explorer", href: "/admin" },
  { id: "api-docs", label: "API", href: "/api-docs" },
  { id: "protocol", label: "Protocol (AIP)", href: "/protocol" },
];

export default function NavBar({ activeTab, variant = "light" }: NavBarProps) {
  const isDark = variant === "dark" || variant === "transparent";
  const isTransparent = variant === "transparent";
  const { isConnected, account } = useConnector();
  const { profile } = useProfile(isConnected && account ? account : undefined);
  const [moreOpen, setMoreOpen] = useState(false);

  const onHoverLink = useCallback((tab: Tab) => {
    const href = ROUTE_BG_MAP[tab];
    if (href) prefetchBackground(href);
  }, []);
  const [mobileOpen, setMobileOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Home is reached by clicking the logo; PRIMARY_TABS no longer contains
  // a "home" entry so the filter is a no-op kept for future per-variant
  // hiding rules.
  const visibleTabs = PRIMARY_TABS;

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

  const tabStyle = (tab: Tab): React.CSSProperties => {
    const isArena = tab === "arena";
    const isBattle = tab === "battle";
    const isActive = activeTab === tab;

    if (isArena || isBattle) {
      return {
        fontFamily: "inherit",
        fontSize: "14px",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        textDecoration: "none",
        color: isActive ? "#fffeb2" : "rgba(255,254,178,0.6)",
        borderBottom: isActive ? "2px solid #fffeb2" : "2px solid transparent",
        paddingBottom: "4px",
        fontWeight: 700,
        transition: "all 0.15s ease",
        textShadow: isActive ? "0 0 8px rgba(255,66,94,0.4)" : "none",
      };
    }

    return {
      fontFamily: "inherit",
      fontSize: "14px",
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      textDecoration: "none",
      color: isActive
        ? (isDark ? "#ffffff" : "#000000")
        : (isDark ? "rgba(255,255,255,0.4)" : "#999999"),
      borderBottom: isActive
        ? `2px solid ${isDark ? "#ffffff" : "#000000"}`
        : "2px solid transparent",
      paddingBottom: "4px",
      transition: "all 0.15s ease",
    };
  };

  return (
    <nav
      style={{
        height: "88px",
        borderBottom: isTransparent ? "none" : (isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #e0e0e0"),
        display: "flex",
        alignItems: "center",
        padding: "0 32px",
        backgroundColor: "transparent",
        position: "relative",
        zIndex: 1000,
        flexWrap: "nowrap",
      }}
    >
      {/* Left — Logo */}
      <Link
        href="/"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          textDecoration: "none",
          flexShrink: 0,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/covenant-logo.png"
          alt="Covenant"
          width={80}
          height={80}
          style={{
            width: "80px",
            height: "80px",
            imageRendering: "pixelated",
            filter: isDark ? "none" : "invert(1)",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: "18px",
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            color: isDark ? "#ffffff" : "#000000",
            fontWeight: 700,
          }}
        >
          Covenant
        </span>
      </Link>

      {/* Center — Tabs (flex:1 + centered) */}
      <div className="nav-tabs" style={{ display: "flex", gap: "20px", alignItems: "center", flex: 1, justifyContent: "center" }}>
        {visibleTabs.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            style={tabStyle(tab.id)}
            onMouseEnter={() => onHoverLink(tab.id)}
            onFocus={() => onHoverLink(tab.id)}
          >
            {tab.label}
          </Link>
        ))}

        {/* More dropdown */}
        <div ref={moreRef} style={{ position: "relative" }}>
          <button
            onClick={() => setMoreOpen(!moreOpen)}
            style={{
              fontFamily: "inherit",
              fontSize: "14px",
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
              gap: "5px",
            }}
          >
            More
            <span style={{
              fontSize: "9px",
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
                minWidth: "200px",
                backgroundColor: isDark ? "rgba(20, 20, 30, 0.95)" : "#ffffff",
                border: isDark ? "1px solid rgba(255,255,255,0.15)" : "1px solid #e0e0e0",
                borderRadius: "8px",
                backdropFilter: "blur(16px)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                zIndex: 1100,
                overflow: "hidden",
              }}
            >
              {MORE_TABS.map((tab) => (
                <Link
                  key={tab.id}
                  href={tab.href}
                  onClick={() => setMoreOpen(false)}
                  onFocus={() => onHoverLink(tab.id)}
                  style={{
                    display: "block",
                    padding: "11px 18px",
                    fontSize: "14px",
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
                    onHoverLink(tab.id);
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
          fontSize: "20px",
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
            top: "88px",
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: isDark ? "rgba(10,10,20,0.98)" : "rgba(255,255,255,0.98)",
            backdropFilter: "blur(16px)",
            zIndex: 1200,
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
                padding: "14px 18px",
                fontSize: "15px",
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

      {/* Right — Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0, whiteSpace: "nowrap" }}>
        <a
          href="https://x.com/WCovenant"
          target="_blank"
          rel="noopener noreferrer"
          title="Follow @WCovenant"
          aria-label="Follow Covenant on X"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "32px",
            height: "32px",
            borderRadius: "6px",
            border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid #e0e0e0",
            color: isDark ? "rgba(255,255,255,0.7)" : "#333",
            textDecoration: "none",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = isDark
              ? "rgba(255,255,255,0.08)"
              : "rgba(0,0,0,0.05)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </a>
        {isConnected && profile && (
          <Link
            href="/profile"
            style={{
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: "5px",
              padding: "4px 8px",
              borderRadius: "6px",
              border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid #e0e0e0",
            }}
          >
            <UserAvatar seed={profile.avatarSeed} avatarUrl={profile.avatarUrl ?? null} size={24} />
          </Link>
        )}
        {isConnected && account && <WalletBalance />}
        {isConnected && account && <NotificationBell wallet={account} variant={isDark ? "dark" : "light"} />}
        <WalletButton />
      </div>
    </nav>
  );
}
