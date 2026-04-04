"use client";

import { USDC_LOGO_URL } from "@/lib/constants";

type EscrowPhase = "idle" | "locking" | "locked" | "releasing" | "released";

interface EscrowVisualizerProps {
  phase: EscrowPhase;
  amount: number;
  posterLabel: string;
  takerLabel: string;
  posterBalance?: number;
  takerBalance?: number;
}

export default function EscrowVisualizer({
  phase,
  amount,
  posterLabel,
  takerLabel,
  posterBalance,
  takerBalance,
}: EscrowVisualizerProps) {
  const isLocking = phase === "locking";
  const isLocked = phase === "locked";
  const isReleasing = phase === "releasing";
  const isReleased = phase === "released";

  const glassCard: React.CSSProperties = {
    width: "100px",
    minHeight: "80px",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.07)",
    backdropFilter: "blur(12px)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "10px 8px",
    position: "relative",
    transition: "all 0.3s ease",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "9px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "rgba(255,255,255,0.5)",
    marginBottom: "4px",
    fontWeight: 600,
  };

  const balanceStyle: React.CSSProperties = {
    fontSize: "13px",
    fontWeight: 700,
    color: "#ffffff",
  };

  const arrowContainer: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    width: "80px",
    height: "40px",
  };

  return (
    <>
      <style>{`
        @keyframes escrow-coin-move-right {
          0% { transform: translateX(0); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateX(60px); opacity: 0; }
        }
        @keyframes escrow-coin-move-left {
          0% { transform: translateX(60px); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateX(0); opacity: 0; }
        }
        @keyframes escrow-pulse-glow {
          0%, 100% { box-shadow: 0 0 8px rgba(234,179,8,0.3); }
          50% { box-shadow: 0 0 20px rgba(234,179,8,0.6); }
        }
        @keyframes escrow-released-glow {
          0%, 100% { box-shadow: 0 0 8px rgba(16,185,129,0.3); }
          50% { box-shadow: 0 0 20px rgba(16,185,129,0.6); }
        }
        @keyframes escrow-confetti {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(-30px) rotate(360deg); opacity: 0; }
        }
      `}</style>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0",
          padding: "16px 0",
        }}
      >
        {/* POSTER box */}
        <div style={glassCard}>
          <div style={labelStyle}>{posterLabel}</div>
          {posterBalance !== undefined && (
            <div style={balanceStyle}>{posterBalance.toFixed(1)}</div>
          )}
          <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.3)", marginTop: "2px" }}>
            POSTER
          </div>
        </div>

        {/* Arrow POSTER -> ESCROW */}
        <div style={arrowContainer}>
          <div
            style={{
              width: "100%",
              height: "2px",
              backgroundColor: "rgba(255,255,255,0.15)",
              position: "relative",
            }}
          >
            {/* Arrow head */}
            <div
              style={{
                position: "absolute",
                right: "-2px",
                top: "-4px",
                width: 0,
                height: 0,
                borderLeft: "6px solid rgba(255,255,255,0.3)",
                borderTop: "5px solid transparent",
                borderBottom: "5px solid transparent",
              }}
            />
          </div>
          {/* Animated coins for locking */}
          {isLocking &&
            [0, 1, 2, 3, 4].map((i) => (
              <div
                key={`lock-${i}`}
                style={{
                  position: "absolute",
                  left: "4px",
                  top: "50%",
                  marginTop: "-3px",
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  backgroundColor: "#FFE342",
                  animation: `escrow-coin-move-right 1.2s ease-in-out ${i * 0.2}s infinite`,
                  boxShadow: "0 0 4px rgba(234,179,8,0.5)",
                }}
              />
            ))}
        </div>

        {/* ESCROW box */}
        <div
          style={{
            ...glassCard,
            borderColor: isLocked
              ? "rgba(234,179,8,0.4)"
              : isReleased
              ? "rgba(16,185,129,0.4)"
              : "rgba(255,255,255,0.15)",
            ...(isLocked
              ? { animation: "escrow-pulse-glow 2s ease-in-out infinite" }
              : {}),
          }}
        >
          <div style={labelStyle}>ESCROW</div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <img
              src={USDC_LOGO_URL}
              alt="USDC"
              width={14}
              height={14}
              style={{ borderRadius: "50%" }}
            />
            <span
              style={{
                ...balanceStyle,
                color:
                  isLocked || isLocking
                    ? "#FFE342"
                    : isReleased
                    ? "#42BDFF"
                    : "#ffffff",
              }}
            >
              {amount.toFixed(1)}
            </span>
          </div>
          <div
            style={{
              fontSize: "8px",
              color: isLocked ? "#FFE342" : "rgba(255,255,255,0.3)",
              marginTop: "2px",
              textTransform: "uppercase",
              fontWeight: isLocked ? 600 : 400,
            }}
          >
            {isLocked ? "LOCKED" : isReleased ? "RELEASED" : "USDC"}
          </div>
        </div>

        {/* Arrow ESCROW -> TAKER */}
        <div style={arrowContainer}>
          <div
            style={{
              width: "100%",
              height: "2px",
              backgroundColor: "rgba(255,255,255,0.15)",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                right: "-2px",
                top: "-4px",
                width: 0,
                height: 0,
                borderLeft: "6px solid rgba(255,255,255,0.3)",
                borderTop: "5px solid transparent",
                borderBottom: "5px solid transparent",
              }}
            />
          </div>
          {/* Animated coins for releasing */}
          {isReleasing &&
            [0, 1, 2, 3, 4].map((i) => (
              <div
                key={`rel-${i}`}
                style={{
                  position: "absolute",
                  left: "4px",
                  top: "50%",
                  marginTop: "-3px",
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  backgroundColor: "#FFE342",
                  animation: `escrow-coin-move-right 1.2s ease-in-out ${i * 0.2}s infinite`,
                  boxShadow: "0 0 4px rgba(234,179,8,0.5)",
                }}
              />
            ))}
        </div>

        {/* TAKER box */}
        <div
          style={{
            ...glassCard,
            ...(isReleased
              ? {
                  borderColor: "rgba(16,185,129,0.4)",
                  animation: "escrow-released-glow 2s ease-in-out infinite",
                }
              : {}),
            position: "relative",
          }}
        >
          <div style={labelStyle}>{takerLabel}</div>
          {takerBalance !== undefined && (
            <div
              style={{
                ...balanceStyle,
                color: isReleased ? "#42BDFF" : "#ffffff",
              }}
            >
              {takerBalance.toFixed(1)}
            </div>
          )}
          <div
            style={{
              fontSize: "8px",
              color: isReleased ? "#42BDFF" : "rgba(255,255,255,0.3)",
              marginTop: "2px",
            }}
          >
            TAKER
          </div>
          {/* Confetti particles */}
          {isReleased &&
            [0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={`conf-${i}`}
                style={{
                  position: "absolute",
                  top: "10px",
                  left: `${15 + i * 14}px`,
                  width: "4px",
                  height: "4px",
                  borderRadius: i % 2 === 0 ? "50%" : "1px",
                  backgroundColor:
                    i % 3 === 0
                      ? "#42BDFF"
                      : i % 3 === 1
                      ? "#FFE342"
                      : "#42BDFF",
                  animation: `escrow-confetti 1.5s ease-out ${i * 0.15}s infinite`,
                }}
              />
            ))}
        </div>
      </div>
    </>
  );
}
