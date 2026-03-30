"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useState, useCallback } from "react";
import { formatAddress } from "@/lib/format";

export default function WalletButton() {
  const { publicKey, disconnect, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = useCallback(() => {
    if (connected) {
      disconnect();
    } else {
      setVisible(true);
    }
  }, [connected, disconnect, setVisible]);

  const baseStyle: React.CSSProperties = {
    fontFamily: "inherit",
    fontSize: "13px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    padding: "8px 20px",
    cursor: "pointer",
    border: "1px solid #000000",
    transition: "all 0.15s ease",
  };

  if (!connected) {
    return (
      <button
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          ...baseStyle,
          backgroundColor: isHovered ? "#000000" : "#ffffff",
          color: isHovered ? "#ffffff" : "#000000",
        }}
      >
        Connect Wallet
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        ...baseStyle,
        backgroundColor: isHovered ? "#ffffff" : "#000000",
        color: isHovered ? "#000000" : "#ffffff",
      }}
    >
      {isHovered ? "Disconnect" : formatAddress(publicKey?.toBase58() || "")}
    </button>
  );
}
