"use client";

import { useMemo, type ReactNode } from "react";
import { AppProvider } from "@solana/connector/react";
import { getDefaultConfig } from "@solana/connector/headless";
import { DEVNET_ENDPOINT } from "@/lib/constants";
import ProfileGate from "./ProfileGate";
import OnboardingTour from "./OnboardingTour";

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

  return (
    <AppProvider connectorConfig={connectorConfig}>
      <ProfileGate>{children}</ProfileGate>
      <OnboardingTour />
    </AppProvider>
  );
}
