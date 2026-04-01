"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "covenant_theme";

export default function ThemeToggle() {
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "light") {
        setIsLight(true);
        document.body.classList.add("light-mode");
      }
    } catch {
      // ignore
    }
  }, []);

  function toggle() {
    const next = !isLight;
    setIsLight(next);
    if (next) {
      document.body.classList.add("light-mode");
    } else {
      document.body.classList.remove("light-mode");
    }
    try {
      localStorage.setItem(STORAGE_KEY, next ? "light" : "dark");
    } catch {
      // ignore
    }
  }

  return (
    <button
      onClick={toggle}
      title={isLight ? "Switch to dark mode" : "Switch to light mode"}
      style={{
        fontFamily: "inherit",
        fontSize: "14px",
        width: "28px",
        height: "28px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: "6px",
        backgroundColor: "transparent",
        color: "rgba(255,255,255,0.6)",
        transition: "all 0.15s ease",
        padding: 0,
        lineHeight: 1,
      }}
    >
      {isLight ? "\u2600" : "\u25D1"}
    </button>
  );
}
