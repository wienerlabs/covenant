"use client";

import { type ReactNode } from "react";
import { useConnector } from "@solana/connector/react";
import useProfile from "@/hooks/useProfile";
import ProfileModal from "./ProfileModal";

interface ProfileGateProps {
  children: ReactNode;
}

export default function ProfileGate({ children }: ProfileGateProps) {
  const { isConnected, account } = useConnector();
  const { profile, loading, notFound, refetch } = useProfile(
    isConnected && account ? account : undefined
  );

  // Not connected — let pages handle their own "connect wallet" messaging
  if (!isConnected || !account) {
    return <>{children}</>;
  }

  // Still loading profile check
  if (loading) {
    return <>{children}</>;
  }

  // Connected but no profile — show creation modal
  if (notFound && !profile) {
    return (
      <>
        {children}
        <ProfileModal
          walletAddress={account}
          onComplete={() => refetch()}
          onClose={() => {
            // User dismissed — still show children, they can interact but modal will reappear on next render cycle
          }}
        />
      </>
    );
  }

  // Connected and profile exists
  return <>{children}</>;
}
