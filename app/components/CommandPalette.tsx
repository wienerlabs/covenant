"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

interface Command {
  label: string;
  href: string;
}

const COMMANDS: Command[] = [
  { label: "Go to Home", href: "/" },
  { label: "Go to Agents", href: "/agents" },
  { label: "Go to Post a Job", href: "/poster" },
  { label: "Go to Find Work", href: "/taker" },
  { label: "Go to Dashboard", href: "/dashboard" },
  { label: "Go to Arena", href: "/arena" },
  { label: "Go to Leaderboard", href: "/leaderboard" },
  { label: "Go to Profile", href: "/profile" },
  { label: "Go to Faucet", href: "/faucet" },
  { label: "Go to Try It", href: "/try" },
  { label: "Go to API Docs", href: "/api-docs" },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const filtered = COMMANDS.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase())
  );

  const handleOpen = useCallback(() => {
    setOpen(true);
    setQuery("");
    setSelectedIndex(0);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setQuery("");
    setSelectedIndex(0);
  }, []);

  const handleSelect = useCallback(
    (href: string) => {
      handleClose();
      router.push(href);
    },
    [handleClose, router]
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (open) {
          handleClose();
        } else {
          handleOpen();
        }
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        handleClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleOpen, handleClose]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      e.preventDefault();
      handleSelect(filtered[selectedIndex].href);
    }
  };

  if (!open) return null;

  return (
    <div
      onClick={handleClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        backgroundColor: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "20vh",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "500px",
          backgroundColor: "rgba(20, 20, 30, 0.95)",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: "12px",
          backdropFilter: "blur(16px)",
          boxShadow: "0 16px 64px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Type a command..."
            style={{
              width: "100%",
              padding: "8px 0",
              fontSize: "14px",
              fontFamily: "inherit",
              backgroundColor: "transparent",
              border: "none",
              outline: "none",
              color: "#ffffff",
            }}
          />
        </div>
        <div style={{ maxHeight: "300px", overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "20px 16px", textAlign: "center", fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>
              No results found
            </div>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.href}
                onClick={() => handleSelect(cmd.href)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  width: "100%",
                  padding: "10px 16px",
                  fontSize: "13px",
                  fontFamily: "inherit",
                  color: i === selectedIndex ? "#ffffff" : "rgba(255,255,255,0.6)",
                  backgroundColor: i === selectedIndex ? "rgba(255,255,255,0.1)" : "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background-color 0.1s ease",
                }}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>
                  {cmd.href}
                </span>
                <span style={{ flex: 1 }}>{cmd.label}</span>
                {i === selectedIndex && (
                  <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)" }}>
                    Enter
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
