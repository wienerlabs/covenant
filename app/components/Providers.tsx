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
          featured: ["Phantom"],
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
          <OnboardingTour />
          <FaucetWidget />
          <TransactionTicker />
          <ToastContainer />
          <CommandPalette />
          <ConfettiContainer />
        </>
      )}
    </AppProvider>
  );
}
