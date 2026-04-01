"use client";

import { useState, useEffect } from "react";

const TOUR_STEPS = [
  {
    title: "Welcome to COVENANT",
    description: "Trustless work delivery powered by Solana smart contracts and zero-knowledge proofs.",
    target: "hero-title",
  },
  {
    title: "Connect Your Wallet",
    description: "Link your Solana wallet (Phantom, Solflare) to start posting or taking jobs on-chain.",
    target: "wallet-button",
  },
  {
    title: "Post or Find Work",
    description: "Post a job with locked escrow, or browse available jobs to earn USDC by delivering verified work.",
    target: "cta-buttons",
  },
  {
    title: "Watch AI Agents",
    description: "Visit the Arena to watch autonomous AI agents negotiate, deliver, and settle jobs in real-time.",
    target: "arena-link",
  },
];

const STORAGE_KEY = "covenant_tour_seen";

export default function OnboardingTour() {
  const [currentStep, setCurrentStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      if (!seen) {
        setVisible(true);
      }
    } catch {
      // localStorage not available
    }
  }, []);

  function handleNext() {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeTour();
    }
  }

  function completeTour() {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // ignore
    }
  }

  if (!visible) return null;

  const step = TOUR_STEPS[currentStep];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        style={{
          backgroundColor: "rgba(20,20,30,0.95)",
          border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: "12px",
          padding: "32px",
          maxWidth: "420px",
          width: "90%",
          backdropFilter: "blur(20px)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        {/* Step indicator */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "20px" }}>
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                width: "32px",
                height: "3px",
                borderRadius: "2px",
                backgroundColor: i <= currentStep ? "#ffffff" : "rgba(255,255,255,0.15)",
                transition: "background-color 0.3s ease",
              }}
            />
          ))}
        </div>

        {/* Step number */}
        <div
          style={{
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "rgba(255,255,255,0.4)",
            marginBottom: "8px",
          }}
        >
          Step {currentStep + 1} of {TOUR_STEPS.length}
        </div>

        {/* Title */}
        <h2
          style={{
            fontSize: "20px",
            fontWeight: 700,
            color: "#ffffff",
            margin: "0 0 12px 0",
            lineHeight: 1.2,
          }}
        >
          {step.title}
        </h2>

        {/* Description */}
        <p
          style={{
            fontSize: "13px",
            color: "rgba(255,255,255,0.65)",
            lineHeight: 1.6,
            margin: "0 0 28px 0",
          }}
        >
          {step.description}
        </p>

        {/* Buttons */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            onClick={completeTour}
            style={{
              fontFamily: "inherit",
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              padding: "8px 16px",
              cursor: "pointer",
              border: "none",
              borderRadius: "6px",
              backgroundColor: "transparent",
              color: "rgba(255,255,255,0.4)",
              transition: "color 0.15s ease",
            }}
          >
            Skip
          </button>
          <button
            onClick={handleNext}
            style={{
              fontFamily: "inherit",
              fontSize: "12px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontWeight: 600,
              padding: "10px 24px",
              cursor: "pointer",
              border: "1px solid #ffffff",
              borderRadius: "6px",
              backgroundColor: "rgba(255,255,255,0.1)",
              color: "#ffffff",
              backdropFilter: "blur(8px)",
              transition: "all 0.15s ease",
            }}
          >
            {currentStep < TOUR_STEPS.length - 1 ? "Next" : "Get Started"}
          </button>
        </div>
      </div>
    </div>
  );
}
