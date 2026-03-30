"use client";

import { useConnector } from "@solana/connector/react";
import { useState } from "react";
import { formatAddress } from "@/lib/format";

export default function WalletButton() {
  const {
    connectors,
    connectWallet,
    disconnectWallet,
    isConnected,
    isConnecting,
    account,
  } = useConnector();
  const [isHovered, setIsHovered] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const baseStyle: React.CSSProperties = {
    fontFamily: "inherit",
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    padding: "8px 20px",
    cursor: isConnecting ? "wait" : "pointer",
    border: "1px solid #000000",
    borderRadius: "6px",
    transition: "all 0.15s ease",
    minWidth: "160px",
    textAlign: "center" as const,
    position: "relative" as const,
  };

  // Connected — show address / disconnect
  if (isConnected && account) {
    return (
      <button
        onClick={() => disconnectWallet()}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          ...baseStyle,
          backgroundColor: isHovered ? "#cc0000" : "#000000",
          color: "#ffffff",
          borderColor: isHovered ? "#cc0000" : "#000000",
        }}
      >
        {isHovered ? "Disconnect" : formatAddress(account)}
      </button>
    );
  }

  // Connecting
  if (isConnecting) {
    return (
      <button disabled style={{ ...baseStyle, backgroundColor: "#000", color: "#fff", opacity: 0.7 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <span style={{ animation: "pulse 1.2s infinite", fontSize: "8px" }}>●</span>
          Connecting...
        </span>
      </button>
    );
  }

  // Disconnected — show connect button + wallet picker
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setShowPicker(!showPicker)}
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

      {showPicker && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setShowPicker(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 99,
            }}
          />
          {/* Dropdown */}
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              zIndex: 100,
              backgroundColor: "#ffffff",
              border: "1px solid #000000",
              borderRadius: "8px",
              padding: "8px",
              minWidth: "220px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            <div
              style={{
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "#999",
                padding: "4px 8px",
              }}
            >
              Select Wallet
            </div>
            {connectors.length === 0 && (
              <div style={{ padding: "12px 8px", fontSize: "11px", color: "#999" }}>
                No wallets detected. Install Phantom or Solflare.
              </div>
            )}
            {connectors.map((connector) => (
              <button
                key={connector.id}
                disabled={!connector.ready}
                onClick={async () => {
                  setShowPicker(false);
                  await connectWallet(connector.id);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 12px",
                  border: "1px solid #e0e0e0",
                  borderRadius: "6px",
                  backgroundColor: "#ffffff",
                  cursor: connector.ready ? "pointer" : "not-allowed",
                  fontFamily: "inherit",
                  fontSize: "12px",
                  textAlign: "left",
                  width: "100%",
                  transition: "all 0.1s ease",
                  opacity: connector.ready ? 1 : 0.4,
                }}
                onMouseEnter={(e) => {
                  if (connector.ready) {
                    e.currentTarget.style.backgroundColor = "#f5f5f5";
                    e.currentTarget.style.borderColor = "#000";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#ffffff";
                  e.currentTarget.style.borderColor = "#e0e0e0";
                }}
              >
                {connector.icon && (
                  <img
                    src={connector.icon}
                    alt={connector.name}
                    width={24}
                    height={24}
                    style={{ borderRadius: "4px" }}
                  />
                )}
                <span>{connector.name}</span>
                {!connector.ready && (
                  <span style={{ fontSize: "9px", color: "#999", marginLeft: "auto" }}>
                    Not installed
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
