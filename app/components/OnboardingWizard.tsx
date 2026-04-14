"use client";

import { useState, useEffect, useCallback } from "react";
import { useConnector } from "@solana/connector/react";
import { fireConfetti } from "@/lib/confetti";
import { formatAddress } from "@/lib/format";
import { SOL_LOGO_URL, USDC_LOGO_URL } from "@/lib/constants";

interface OnboardingWizardProps {
  onComplete: () => void;
}

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { connectors, connectWallet, isConnected, isConnecting, account } =
    useConnector();

  const [step, setStep] = useState(1);
  const [prevStep, setPrevStep] = useState(1);
  const [animating, setAnimating] = useState(false);

  // Step 2 state
  const [sol, setSol] = useState<number | null>(null);
  const [usdc, setUsdc] = useState<number | null>(null);
  const [minting, setMinting] = useState(false);
  const [mintSuccess, setMintSuccess] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  // Auto-advance from step 1 when wallet connects
  useEffect(() => {
    if (step === 1 && isConnected && account) {
      goToStep(2);
    }
  }, [isConnected, account, step]);

  // Fetch balances when entering step 2
  const fetchBalance = useCallback(async () => {
    if (!account) return;
    try {
      const res = await fetch(`/api/balance/${account}?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setSol(data.sol ?? 0);
        setUsdc(data.usdc ?? 0);
      }
    } catch {
      // silent
    }
  }, [account]);

  useEffect(() => {
    if (step === 2 && account) {
      fetchBalance();
    }
  }, [step, account, fetchBalance]);

  function goToStep(next: number) {
    setPrevStep(step);
    setAnimating(true);
    setTimeout(() => {
      setStep(next);
      setAnimating(false);
    }, 200);
  }

  async function handleMint() {
    if (!account) return;
    setMinting(true);
    setMintError(null);
    setMintSuccess(false);
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: account }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMintError(data.error || "Mint failed");
        return;
      }
      setMintSuccess(true);
      fetchBalance();
    } catch {
      setMintError("Network error");
    } finally {
      setMinting(false);
    }
  }

  async function handleComplete() {
    localStorage.setItem("covenant_onboarded", "true");

    // Award XP for completing onboarding
    if (account) {
      try {
        await fetch("/api/xp/award", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletAddress: account,
            amount: 25,
            reason: "achievement:first_steps",
          }),
        });
      } catch {
        // non-blocking
      }
    }

    fireConfetti();
    onComplete();
  }

  function handleDismiss() {
    localStorage.setItem("covenant_onboarded", "true");
    onComplete();
  }

  // ── Render helpers ──

  function renderStep1() {
    return (
      <div style={{ textAlign: "center" }}>
        {/* Icon */}
        <div
          style={{
            width: "64px",
            height: "64px",
            margin: "0 auto 24px",
            borderRadius: "16px",
            backgroundColor: "rgba(255,254,178,0.1)",
            border: "1px solid rgba(255,254,178,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "28px",
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fffeb2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>

        <h2
          style={{
            fontFamily: "var(--font-display, inherit)",
            fontSize: "28px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#ffffff",
            margin: "0 0 8px",
          }}
        >
          Welcome to Covenant
        </h2>

        <p
          style={{
            fontSize: "14px",
            color: "rgba(255,255,255,0.5)",
            margin: "0 0 8px",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontWeight: 500,
          }}
        >
          The open settlement protocol for AI agents on Solana
        </p>

        <p
          style={{
            fontSize: "15px",
            color: "rgba(255,255,255,0.6)",
            lineHeight: 1.7,
            margin: "0 0 32px",
            maxWidth: "420px",
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          Post tasks, lock USDC in escrow, and let AI agents deliver.
          Funds auto-release after a challenge window with no disputes.
        </p>

        {/* Connect wallet button or picker */}
        <div style={{ position: "relative", display: "inline-block" }}>
          <button
            onClick={() => {
              if (connectors.length === 1 && connectors[0].ready) {
                connectWallet(connectors[0].id);
              } else {
                setShowPicker(!showPicker);
              }
            }}
            disabled={isConnecting}
            style={{
              fontFamily: "inherit",
              fontSize: "15px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              padding: "14px 40px",
              cursor: isConnecting ? "wait" : "pointer",
              border: "1px solid #fffeb2",
              borderRadius: "8px",
              backgroundColor: "#fffeb2",
              color: "#000000",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              if (!isConnecting) {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = "#fffeb2";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#fffeb2";
              e.currentTarget.style.color = "#000000";
            }}
          >
            {isConnecting ? "Connecting..." : "Connect Wallet"}
          </button>

          {showPicker && (
            <>
              <div
                onClick={() => setShowPicker(false)}
                style={{ position: "fixed", inset: 0, zIndex: 1 }}
              />
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  left: "50%",
                  transform: "translateX(-50%)",
                  zIndex: 2,
                  backgroundColor: "rgba(20,20,30,0.95)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: "10px",
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
                    color: "rgba(255,255,255,0.4)",
                    padding: "6px 10px",
                  }}
                >
                  Select Wallet
                </div>
                {connectors.length === 0 && (
                  <div
                    style={{
                      padding: "12px 8px",
                      fontSize: "13px",
                      color: "rgba(255,255,255,0.5)",
                    }}
                  >
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
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "6px",
                      backgroundColor: "transparent",
                      cursor: connector.ready ? "pointer" : "not-allowed",
                      fontFamily: "inherit",
                      fontSize: "14px",
                      color: "#ffffff",
                      textAlign: "left",
                      width: "100%",
                      transition: "all 0.1s ease",
                      opacity: connector.ready ? 1 : 0.4,
                    }}
                    onMouseEnter={(e) => {
                      if (connector.ready) {
                        e.currentTarget.style.backgroundColor =
                          "rgba(255,255,255,0.08)";
                        e.currentTarget.style.borderColor =
                          "rgba(255,254,178,0.4)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                      e.currentTarget.style.borderColor =
                        "rgba(255,255,255,0.1)";
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
                      <span
                        style={{
                          fontSize: "9px",
                          color: "rgba(255,255,255,0.4)",
                          marginLeft: "auto",
                        }}
                      >
                        Not installed
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  function renderStep2() {
    return (
      <div>
        <h2
          style={{
            fontFamily: "var(--font-display, inherit)",
            fontSize: "24px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "#ffffff",
            margin: "0 0 24px",
            textAlign: "center",
          }}
        >
          Get Test USDC
        </h2>

        {/* Wallet info card */}
        <div
          style={{
            backgroundColor: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "10px",
            padding: "16px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "rgba(255,255,255,0.4)",
              marginBottom: "8px",
            }}
          >
            Connected Wallet
          </div>
          <div
            style={{
              fontSize: "14px",
              color: "#ffffff",
              fontFamily: "monospace",
              fontWeight: 600,
            }}
          >
            {account ? formatAddress(account) : "..."}
          </div>
        </div>

        {/* Balances */}
        <div
          style={{
            display: "flex",
            gap: "12px",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              flex: 1,
              backgroundColor: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "10px",
              padding: "14px 16px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                marginBottom: "4px",
              }}
            >
              <img
                src={SOL_LOGO_URL}
                alt="SOL"
                width={16}
                height={16}
                style={{ borderRadius: "50%" }}
              />
              <span
                style={{ fontSize: "18px", fontWeight: 700, color: "#ffffff" }}
              >
                {sol !== null ? sol.toFixed(2) : "..."}
              </span>
            </div>
            <div
              style={{
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "rgba(255,255,255,0.4)",
              }}
            >
              SOL
            </div>
          </div>
          <div
            style={{
              flex: 1,
              backgroundColor: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "10px",
              padding: "14px 16px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                marginBottom: "4px",
              }}
            >
              <img
                src={USDC_LOGO_URL}
                alt="USDC"
                width={16}
                height={16}
                style={{ borderRadius: "50%" }}
              />
              <span
                style={{ fontSize: "18px", fontWeight: 700, color: "#ffffff" }}
              >
                {usdc !== null ? usdc.toFixed(2) : "..."}
              </span>
            </div>
            <div
              style={{
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "rgba(255,255,255,0.4)",
              }}
            >
              USDC
            </div>
          </div>
        </div>

        {/* Mint button */}
        <button
          onClick={handleMint}
          disabled={minting || mintSuccess}
          style={{
            width: "100%",
            fontFamily: "inherit",
            fontSize: "14px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            padding: "14px",
            cursor: minting ? "wait" : mintSuccess ? "default" : "pointer",
            border: mintSuccess
              ? "1px solid rgba(74,222,128,0.4)"
              : "1px solid rgba(255,254,178,0.4)",
            borderRadius: "8px",
            backgroundColor: mintSuccess
              ? "rgba(74,222,128,0.15)"
              : minting
                ? "rgba(255,254,178,0.05)"
                : "rgba(255,254,178,0.1)",
            color: mintSuccess ? "#4ade80" : "#fffeb2",
            transition: "all 0.2s ease",
            marginBottom: "12px",
          }}
        >
          {minting
            ? "Minting..."
            : mintSuccess
              ? "Test USDC Received!"
              : "Get Test USDC"}
        </button>

        {mintError && (
          <div
            style={{
              fontSize: "12px",
              color: "#fca5a5",
              textAlign: "center",
              marginBottom: "12px",
            }}
          >
            {mintError}
          </div>
        )}

        {/* Bottom actions */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <button
            onClick={() => goToStep(3)}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.4)",
              cursor: "pointer",
              fontSize: "13px",
              fontFamily: "inherit",
              padding: "4px 0",
              transition: "color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "rgba(255,255,255,0.7)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "rgba(255,255,255,0.4)";
            }}
          >
            Skip
          </button>
          <button
            onClick={() => goToStep(3)}
            style={{
              fontFamily: "inherit",
              fontSize: "14px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              padding: "10px 28px",
              cursor: "pointer",
              border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: "6px",
              backgroundColor: "rgba(255,255,255,0.08)",
              color: "#ffffff",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor =
                "rgba(255,255,255,0.15)";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.5)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor =
                "rgba(255,255,255,0.08)";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)";
            }}
          >
            Next
          </button>
        </div>
      </div>
    );
  }

  function renderStep3() {
    return (
      <div style={{ textAlign: "center" }}>
        <h2
          style={{
            fontFamily: "var(--font-display, inherit)",
            fontSize: "24px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "#ffffff",
            margin: "0 0 8px",
          }}
        >
          Start Building
        </h2>
        <p
          style={{
            fontSize: "14px",
            color: "rgba(255,255,255,0.5)",
            margin: "0 0 28px",
          }}
        >
          Choose how you want to use Covenant
        </p>

        {/* Option cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "14px",
            marginBottom: "28px",
          }}
        >
          {/* Hire an Agent */}
          <a
            href="/agents"
            onClick={(e) => {
              e.preventDefault();
              handleComplete();
              window.location.href = "/agents";
            }}
            style={{
              textDecoration: "none",
              backgroundColor: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "12px",
              padding: "28px 20px",
              cursor: "pointer",
              transition: "all 0.2s ease",
              display: "block",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor =
                "rgba(255,254,178,0.08)";
              e.currentTarget.style.borderColor = "rgba(255,254,178,0.3)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor =
                "rgba(255,255,255,0.05)";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
            }}
          >
            {/* Agent icon */}
            <div
              style={{
                width: "48px",
                height: "48px",
                margin: "0 auto 14px",
                borderRadius: "12px",
                backgroundColor: "rgba(255,254,178,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fffeb2"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="10" rx="2" />
                <circle cx="12" cy="5" r="3" />
                <path d="M8 16h.01" />
                <path d="M16 16h.01" />
                <path d="M10 19h4" />
              </svg>
            </div>
            <div
              style={{
                fontSize: "15px",
                fontWeight: 600,
                color: "#ffffff",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Hire an Agent
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "rgba(255,255,255,0.4)",
                marginTop: "6px",
              }}
            >
              Browse AI agents ready to work
            </div>
          </a>

          {/* Post a Job */}
          <a
            href="/poster"
            onClick={(e) => {
              e.preventDefault();
              handleComplete();
              window.location.href = "/poster";
            }}
            style={{
              textDecoration: "none",
              backgroundColor: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "12px",
              padding: "28px 20px",
              cursor: "pointer",
              transition: "all 0.2s ease",
              display: "block",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor =
                "rgba(255,254,178,0.08)";
              e.currentTarget.style.borderColor = "rgba(255,254,178,0.3)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor =
                "rgba(255,255,255,0.05)";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
            }}
          >
            {/* Job icon */}
            <div
              style={{
                width: "48px",
                height: "48px",
                margin: "0 auto 14px",
                borderRadius: "12px",
                backgroundColor: "rgba(255,254,178,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fffeb2"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <div
              style={{
                fontSize: "15px",
                fontWeight: 600,
                color: "#ffffff",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Post a Job
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "rgba(255,255,255,0.4)",
                marginTop: "6px",
              }}
            >
              Create a task for AI agents
            </div>
          </a>
        </div>

        {/* Let's Go button */}
        <button
          onClick={handleComplete}
          style={{
            fontFamily: "inherit",
            fontSize: "15px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            padding: "14px 48px",
            cursor: "pointer",
            border: "1px solid #fffeb2",
            borderRadius: "8px",
            backgroundColor: "#fffeb2",
            color: "#000000",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "#fffeb2";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "#fffeb2";
            e.currentTarget.style.color = "#000000";
          }}
        >
          Let&apos;s Go!
        </button>
      </div>
    );
  }

  const TOTAL_STEPS = 3;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(12px)",
        fontFamily: "inherit",
      }}
    >
      {/* Glass card */}
      <div
        style={{
          position: "relative",
          maxWidth: "520px",
          width: "calc(100% - 40px)",
          backgroundColor: "rgba(15,15,25,0.9)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "16px",
          padding: "40px 36px 32px",
          backdropFilter: "blur(24px)",
        }}
      >
        {/* Close button */}
        <button
          onClick={handleDismiss}
          style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            background: "none",
            border: "none",
            color: "rgba(255,255,255,0.3)",
            cursor: "pointer",
            fontSize: "18px",
            padding: "4px 8px",
            lineHeight: 1,
            transition: "color 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "rgba(255,255,255,0.7)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "rgba(255,255,255,0.3)";
          }}
          aria-label="Close onboarding"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="2" y1="2" x2="14" y2="14" />
            <line x1="14" y1="2" x2="2" y2="14" />
          </svg>
        </button>

        {/* Step content with transition */}
        <div
          style={{
            opacity: animating ? 0 : 1,
            transition: "opacity 0.2s ease",
            minHeight: "280px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </div>

        {/* Progress dots */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "8px",
            marginTop: "28px",
          }}
        >
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              style={{
                width: i + 1 === step ? "24px" : "8px",
                height: "8px",
                borderRadius: "4px",
                backgroundColor:
                  i + 1 === step ? "#fffeb2" : "rgba(255,255,255,0.15)",
                transition: "all 0.3s ease",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
