"use client";

import { useState, useEffect, useRef } from "react";
import { useConnector } from "@solana/connector/react";
import { SOL_LOGO_URL, USDC_LOGO_URL } from "@/lib/constants";

export default function WalletBalance() {
  const { isConnected, account } = useConnector();
  const [sol, setSol] = useState<number | null>(null);
  const [usdc, setUsdc] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isConnected || !account) {
      setSol(null);
      setUsdc(null);
      return;
    }

    async function fetchBalance() {
      try {
        const res = await fetch(`/api/balance/${account}`);
        if (res.ok) {
          const data = await res.json();
          setSol(data.sol ?? 0);
          setUsdc(data.usdc ?? 0);
        }
      } catch {
        // silent
      }
    }

    fetchBalance();
    intervalRef.current = setInterval(fetchBalance, 10000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isConnected, account]);

  if (!isConnected || !account || sol === null) return null;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "10px",
        color: "rgba(255,255,255,0.7)",
        padding: "3px 8px",
        borderRadius: "6px",
        border: "1px solid rgba(255,255,255,0.12)",
        backgroundColor: "rgba(255,255,255,0.05)",
        backdropFilter: "blur(8px)",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
        <img src={SOL_LOGO_URL} alt="SOL" width={12} height={12} style={{ borderRadius: "50%" }} />
        {sol !== null ? sol.toFixed(2) : "..."}
      </span>
      <span style={{ color: "rgba(255,255,255,0.2)" }}>|</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
        <img src={USDC_LOGO_URL} alt="USDC" width={12} height={12} style={{ borderRadius: "50%" }} />
        {usdc !== null ? usdc.toFixed(2) : "..."}
      </span>
    </div>
  );
}
