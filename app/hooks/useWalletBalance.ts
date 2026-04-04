import { useState, useEffect, useRef, useCallback } from "react";

interface WalletBalanceResult {
  sol: number;
  usdc: number;
  loading: boolean;
  refetch: () => void;
}

export default function useWalletBalance(wallet?: string | null): WalletBalanceResult {
  const [sol, setSol] = useState(0);
  const [usdc, setUsdc] = useState(0);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!wallet) {
      setSol(0);
      setUsdc(0);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/balance/${wallet}`);
      if (res.ok) {
        const data = await res.json();
        setSol(data.sol ?? 0);
        setUsdc(data.usdc ?? 0);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  const refetch = useCallback(() => {
    setLoading(true);
    fetchBalance();
  }, [fetchBalance]);

  useEffect(() => {
    setLoading(true);
    fetchBalance();

    intervalRef.current = setInterval(fetchBalance, 15000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchBalance]);

  return { sol, usdc, loading, refetch };
}
