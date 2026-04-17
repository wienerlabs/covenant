"use client";

/**
 * Click-through detail drawer for a marketplace claim. Shows:
 *   - Full job spec (title, description, category, payment)
 *   - Seller reputation breakdown
 *   - On-chain links (JobEscrow PDA, ClaimListing PDA, list tx)
 *   - Duration countdown until the claim settles on chain
 *   - "Buy" CTA duplicated here for in-context conversion
 */

import { useEffect, useState } from "react";
import {
  RiskPill,
  SolscanLink,
  formatDuration,
  shortWallet,
  type ReputationSummary,
} from "./CreditHelpers";

export interface ClaimRowLite {
  id: string;
  pda: string;
  jobId: string;
  jobPda: string;
  sellerWallet: string;
  buyerWallet: string | null;
  price: number;
  faceValue: number;
  status: string;
  listedAt: string;
  listTxHash?: string | null;
  buyTxHash?: string | null;
  discountPct: number;
  aprPct: number;
  secondsToChallengeEnd: number;
  reputation?: ReputationSummary;
  job: {
    id: string;
    posterWallet: string;
    takerWallet: string | null;
    category: string;
    amount: number;
    specJson: Record<string, unknown>;
    challengeEndAt: string | null;
  };
}

interface Props {
  claim: ClaimRowLite | null;
  onClose: () => void;
  currentWallet: string | null;
  onBuy: (claim: ClaimRowLite) => void;
  buying: boolean;
}

export default function ClaimDetailDrawer({
  claim,
  onClose,
  currentWallet,
  onBuy,
  buying,
}: Props) {
  const [secondsLeft, setSecondsLeft] = useState(
    claim?.secondsToChallengeEnd ?? 0,
  );

  useEffect(() => {
    setSecondsLeft(claim?.secondsToChallengeEnd ?? 0);
    if (!claim) return;
    const iv = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(iv);
  }, [claim]);

  if (!claim) return null;

  const title =
    (claim.job.specJson as { title?: string } | undefined)?.title ??
    `Job ${claim.jobId.slice(0, 6)}`;
  const description = (claim.job.specJson as { description?: string } | undefined)
    ?.description;
  const isOwn = currentWallet === claim.sellerWallet;
  const isExpired = secondsLeft <= 0;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(6px)",
        zIndex: 90,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#0f0f0f",
          borderLeft: "1px solid rgba(255,255,255,0.1)",
          overflowY: "auto",
          padding: 28,
          color: "#fff",
          fontFamily: "inherit",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div
              style={{
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "rgba(255,255,255,0.5)",
                marginBottom: 4,
                fontWeight: 700,
              }}
            >
              Claim · {claim.status}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>
              {title}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>
              {claim.job.category}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: "6px 12px",
              fontFamily: "inherit",
              fontSize: 11,
              color: "rgba(255,255,255,0.6)",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

        {/* Price block */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 10,
            marginBottom: 20,
          }}
        >
          <StatTile label="Face value" value={`$${claim.faceValue.toFixed(2)}`} />
          <StatTile
            label="Price"
            value={`$${claim.price.toFixed(2)}`}
            accent="#fffeb2"
          />
          <StatTile
            label="APR"
            value={`${claim.aprPct >= 1000 ? Math.round(claim.aprPct) : claim.aprPct.toFixed(0)}%`}
            accent="#7CFF7C"
          />
        </div>

        {/* Countdown */}
        <div
          style={{
            marginBottom: 20,
            padding: "14px 16px",
            background:
              secondsLeft < 3600
                ? "rgba(255,184,77,0.08)"
                : "rgba(255,255,255,0.03)",
            border: `1px solid ${secondsLeft < 3600 ? "#FFB84D40" : "rgba(255,255,255,0.08)"}`,
            borderRadius: 8,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "rgba(255,255,255,0.5)",
              marginBottom: 4,
              fontWeight: 700,
            }}
          >
            {isExpired ? "Challenge window closed" : "Settles in"}
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: secondsLeft < 3600 ? "#FFB84D" : "#fff",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatDuration(secondsLeft)}
          </div>
        </div>

        {/* Seller */}
        <div style={{ marginBottom: 20 }}>
          <SectionHeading>Seller</SectionHeading>
          <div
            style={{
              padding: 14,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {shortWallet(claim.sellerWallet)}
              </span>
              {claim.reputation && <RiskPill rep={claim.reputation} />}
            </div>
            {claim.reputation && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 8,
                  fontSize: 11,
                }}
              >
                <MiniStat label="Completed" value={String(claim.reputation.jobsCompleted)} />
                <MiniStat label="Failed" value={String(claim.reputation.jobsFailed)} />
                <MiniStat label="Disputed" value={String(claim.reputation.jobsDisputed)} color="#FF425E" />
                <MiniStat
                  label="Earned"
                  value={`$${claim.reputation.totalEarned.toFixed(0)}`}
                  color="#7CFF7C"
                />
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        {description && (
          <div style={{ marginBottom: 20 }}>
            <SectionHeading>Job description</SectionHeading>
            <div
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.7)",
                lineHeight: 1.6,
                maxHeight: 160,
                overflowY: "auto",
                padding: 12,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 8,
              }}
            >
              {description}
            </div>
          </div>
        )}

        {/* On-chain links */}
        <div style={{ marginBottom: 20 }}>
          <SectionHeading>On-chain</SectionHeading>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {claim.jobPda && (
              <LinkRow label="JobEscrow PDA" value={claim.jobPda} />
            )}
            {claim.pda && <LinkRow label="ClaimListing PDA" value={claim.pda} />}
            {claim.listTxHash && (
              <LinkRow label="list_claim tx" value={claim.listTxHash} kind="tx" />
            )}
            {claim.buyTxHash && (
              <LinkRow label="buy_claim tx" value={claim.buyTxHash} kind="tx" />
            )}
          </div>
        </div>

        {/* CTA */}
        {claim.status === "Listed" && !isOwn && !isExpired && (
          <button
            onClick={() => onBuy(claim)}
            disabled={buying || !currentWallet}
            style={{
              width: "100%",
              padding: 14,
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "#000",
              background:
                buying || !currentWallet ? "rgba(255,254,178,0.4)" : "#fffeb2",
              border: "none",
              borderRadius: 8,
              cursor: buying || !currentWallet ? "not-allowed" : "pointer",
            }}
          >
            {!currentWallet
              ? "Connect wallet to buy"
              : buying
                ? "Buying…"
                : `Buy for $${claim.price.toFixed(2)}`}
          </button>
        )}
        {isOwn && (
          <div
            style={{
              padding: 12,
              fontSize: 12,
              color: "rgba(255,255,255,0.5)",
              textAlign: "center",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
            }}
          >
            This is your listing.
          </div>
        )}
        {isExpired && (
          <div
            style={{
              padding: 12,
              fontSize: 12,
              color: "#FFB84D",
              textAlign: "center",
              background: "rgba(255,184,77,0.08)",
              border: "1px solid #FFB84D40",
              borderRadius: 8,
            }}
          >
            Challenge window has closed — this claim will settle on the next
            cron cycle.
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        color: "rgba(255,255,255,0.5)",
        marginBottom: 8,
        fontWeight: 700,
      }}
    >
      {children}
    </div>
  );
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        padding: "12px 10px",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 8,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "rgba(255,255,255,0.4)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: accent ?? "#fff" }}>
        {value}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: color ?? "#fff" }}>
        {value}
      </div>
    </div>
  );
}

function LinkRow({ label, value, kind = "address" }: { label: string; value: string; kind?: "address" | "tx" }) {
  return (
    <div
      style={{
        padding: "8px 10px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 6,
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 11,
      }}
    >
      <span style={{ color: "rgba(255,255,255,0.5)" }}>{label}</span>
      <span style={{ color: "#fff", fontFamily: "monospace" }}>
        {value.slice(0, 4)}…{value.slice(-4)}
      </span>
      <SolscanLink value={value} kind={kind} label="↗" />
    </div>
  );
}
