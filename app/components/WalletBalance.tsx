"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useConnector } from "@solana/connector/react";
import { SOL_LOGO_URL, USDC_LOGO_URL } from "@/lib/constants";
import { onBalanceRefresh } from "@/lib/balance-bus";

export default function WalletBalance() {
  const { isConnected, account } = useConnector();
  const [sol, setSol] = useState<number | null>(null);
  const [usdc, setUsdc] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const accountRef = useRef(account);
  accountRef.current = account;

  const fetchBalance = useCallback(async (highlight = false) => {
    const wallet = accountRef.current;
    if (!wallet) return;
    try {
      // Cache-bust so the browser never holds a stale 10-second cached result
      const res = await fetch(`/api/balance/${wallet}?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setSol(data.sol ?? 0);
        setUsdc(data.usdc ?? 0);
        if (highlight) {
          setFlash(true);
          setTimeout(() => setFlash(false), 1200);
        }
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    if (!isConnected || !account) {
      setSol(null);
      setUsdc(null);
      return;
    }

    void fetchBalance(false);
    intervalRef.current = setInterval(() => fetchBalance(false), 10000);

    // Listen for imperative refreshes from any component that just moved
    // the user's wallet balance (CreateJobForm, DisputeModal, etc.)
    const unsubscribe = onBalanceRefresh(() => {
      void fetchBalance(true);
    });

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      unsubscribe();
    };
  }, [isConnected, account, fetchBalance]);

  if (!isConnected || !account || sol === null) return null;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "12px",
        color: flash ? "#fffeb2" : "rgba(255,255,255,0.7)",
        padding: "5px 10px",
        borderRadius: "6px",
        border: flash
          ? "1px solid rgba(255,227,66,0.5)"
          : "1px solid rgba(255,255,255,0.12)",
        backgroundColor: flash
          ? "rgba(255,227,66,0.12)"
          : "rgba(255,255,255,0.05)",
        backdropFilter: "blur(8px)",
        transition: "all 0.35s ease",
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
