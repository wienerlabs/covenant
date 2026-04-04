"use client";

import { useState, useCallback } from "react";

interface CopyButtonProps {
  text: string;
  label?: string;
}

export default function CopyButton({ text, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      title={label || "Copy to clipboard"}
      style={{
        fontFamily: "inherit",
        fontSize: "9px",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        padding: "1px 5px",
        cursor: "pointer",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: "3px",
        backgroundColor: copied ? "rgba(134,239,172,0.15)" : "transparent",
        color: copied ? "#FFE342" : "rgba(255,255,255,0.4)",
        transition: "all 0.15s ease",
        display: "inline-flex",
        alignItems: "center",
        gap: "2px",
        verticalAlign: "middle",
        lineHeight: 1,
      }}
    >
      {copied ? "COPIED \u2713" : "COPY"}
    </button>
  );
}
