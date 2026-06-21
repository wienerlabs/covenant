"use client";

import { useEffect, useRef } from "react";
import { useConnector } from "@solana/connector/react";
import { ensureSession, endSession } from "@/lib/auth-login";

/**
 * Establishes a wallet session (C-091 activation) when a wallet connects.
 *
 * On connect it calls `ensureSession`, which is a no-op when a valid session
 * cookie already exists (so reconnects via autoConnect do NOT re-prompt) and
 * when session auth is disabled on the deployment. Only a genuinely new login
 * triggers a single `signMessage` popup. Renders nothing.
 */
export default function SessionGate() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connector = useConnector() as any;
  const isConnected: boolean = !!connector?.isConnected;
  const account: string | undefined = connector?.account;
  const selectedWallet = connector?.selectedWallet ?? null;
  const triedFor = useRef<string | null>(null);

  useEffect(() => {
    if (isConnected && account && selectedWallet) {
      if (triedFor.current !== account) {
        triedFor.current = account;
        void ensureSession(selectedWallet, account);
      }
    } else if (!isConnected && triedFor.current) {
      triedFor.current = null;
      void endSession();
    }
  }, [isConnected, account, selectedWallet]);

  return null;
}
