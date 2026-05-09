"use client";

import { useMemo, useState, useEffect, type ReactNode } from "react";
import { AppProvider } from "@solana/connector/react";
import { getDefaultConfig } from "@solana/connector/headless";
import { DEVNET_ENDPOINT } from "@/lib/constants";
import ProfileGate from "./ProfileGate";
import OnboardingTour from "./OnboardingTour";
import FaucetWidget from "./FaucetWidget";
import TransactionTicker from "./TransactionTicker";
import ToastContainer from "./ToastContainer";
import CommandPalette from "./CommandPalette";
import ConfettiContainer from "./ConfettiContainer";
import NavigationProgress from "./NavigationProgress";
import TxConfirmationContainer from "./TxConfirmationContainer";

interface ProvidersProps {
  children: ReactNode;
}

export default function Providers({ children }: ProvidersProps) {
  const connectorConfig = useMemo(
    () =>
      getDefaultConfig({
        appName: "COVENANT",
        appUrl: typeof window !== "undefined" ? window.location.origin : "https://covenant.dev",
        autoConnect: true,
        enableMobile: true,
        clusters: [
          {
            id: "solana:devnet" as const,
            label: "Devnet",
            url: DEVNET_ENDPOINT,
          },
        ],
        wallets: {
          // Featured wallets surface first in the connector modal. OKX
          // Wallet registers as a wallet-standard provider (browser
          // extension + mobile injects under this name), so listing it
          // here is enough — no extra adapter needed.
          featured: ["Phantom", "OKX Wallet"],
        },
      }),
    []
  );

  // Ensure client-side only rendering for widgets that access browser APIs
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <AppProvider connectorConfig={connectorConfig}>
      <ProfileGate>{children}</ProfileGate>
      {mounted && (
        <>
          <NavigationProgress />
          <OnboardingTour />
          <FaucetWidget />
          <TransactionTicker />
          <ToastContainer />
          <CommandPalette />
          <ConfettiContainer />
          <TxConfirmationContainer />
        </>
      )}
    </AppProvider>
  );
}
