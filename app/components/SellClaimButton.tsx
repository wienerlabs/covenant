"use client";

/**
 * SellClaimButton — lets the taker list their pending payment claim on
 * Covenant Credit. Appears only for jobs the caller actually took and
 * that are currently in `Delivered` state with no active dispute.
 *
 * UX: click → modal with price slider (default 97% = 3% discount) →
 * preview yield → confirm → sign list_claim in wallet → POST to
 * /api/claims to mirror the on-chain state into the DB.
 */

import { useState } from "react";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { useConnector } from "@solana/connector/react";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getAnchorProgram, listClaimOnChain } from "@/lib/anchor-browser";
import { USDC_DECIMALS } from "@/lib/constants";

interface SellClaimButtonProps {
  jobId: string;
  posterWallet: string;
  takerWallet: string;
  specHashHex: string;
  faceValue: number;
  /** True if a ClaimListing already exists for this job. */
  alreadyListed?: boolean;
  onListed?: () => void;
}

function toAtomic(amount: number): BN {
  return new BN(Math.round(amount * 10 ** USDC_DECIMALS));
}

export default function SellClaimButton(props: SellClaimButtonProps) {
  const connector = useConnector();
  const account =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (connector as any)?.account?.address ??
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (connector as any)?.selectedWallet?.accounts?.[0]?.address ??
    null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selectedWallet = (connector as any)?.selectedWallet ?? null;

  const [open, setOpen] = useState(false);
  const [discountPct, setDiscountPct] = useState(3); // default 3% discount
  const [listing, setListing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isTaker = account === props.takerWallet;
  if (!isTaker || props.alreadyListed) return null;

  const price = Math.max(0.000001, props.faceValue * (1 - discountPct / 100));
  const earnedNow = price;
  const lenderYield = props.faceValue - price;

  async function handleConfirm() {
    if (!account || !selectedWallet) {
      setErr("Connect your wallet first.");
      return;
    }
    setListing(true);
    setErr(null);
    try {
      const program = getAnchorProgram(account, selectedWallet);
      if (!program) throw new Error("wallet program unavailable");

      const specHash = Uint8Array.from(Buffer.from(props.specHashHex, "hex"));
      const priceBn = toAtomic(price);
      const sellerPk = new PublicKey(account);
      const posterPk = new PublicKey(props.posterWallet);

      const { sig } = await listClaimOnChain({
        program,
        seller: sellerPk,
        poster: posterPk,
        specHash,
        price: priceBn,
      });

      const mirrorRes = await fetch("/api/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: props.jobId, txSignature: sig }),
      });
      if (!mirrorRes.ok) {
        const txt = await mirrorRes.text();
        throw new Error(`mirror failed: ${txt}`);
      }

      setOpen(false);
      props.onListed?.();
    } catch (e) {
      console.error("[sell-claim] failed:", e);
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setListing(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: "10px 18px",
          fontFamily: "inherit",
          fontSize: 12,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#000",
          background: "#fffeb2",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
        }}
      >
        Sell claim →
      </button>

      {open && (
        <div
          onClick={() => !listing && setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(6px)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 440,
              background: "#111",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12,
              padding: 28,
              color: "#fff",
              fontFamily: "inherit",
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
              Sell your pending claim
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 20, lineHeight: 1.5 }}>
              Skip the 24h challenge window. Get paid in USDC now, the lender
              collects the full face value when finalize_payment fires.
            </div>

            {/* Discount slider */}
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "rgba(255,255,255,0.5)",
                  marginBottom: 6,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>Discount</span>
                <span style={{ color: "#7CFF7C" }}>{discountPct.toFixed(1)}%</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={20}
                step={0.5}
                value={discountPct}
                onChange={(e) => setDiscountPct(parseFloat(e.target.value))}
                disabled={listing}
                style={{ width: "100%", accentColor: "#fffeb2" }}
              />
              <div
                style={{
                  fontSize: 10,
                  color: "rgba(255,255,255,0.4)",
                  marginTop: 4,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>0.5% (tight)</span>
                <span>20% (fast sale)</span>
              </div>
            </div>

            {/* Preview */}
            <div
              style={{
                background: "rgba(255,254,178,0.05)",
                border: "1px solid rgba(255,254,178,0.2)",
                borderRadius: 8,
                padding: 16,
                marginBottom: 16,
                fontSize: 13,
              }}
            >
              <Row label="Face value" value={`$${props.faceValue.toFixed(2)}`} />
              <Row
                label="You receive now"
                value={`$${earnedNow.toFixed(2)}`}
                accent="#fffeb2"
                strong
              />
              <Row label="Lender earns" value={`$${lenderYield.toFixed(2)}`} accent="#7CFF7C" />
            </div>

            {err && (
              <div
                style={{
                  padding: 10,
                  borderRadius: 6,
                  fontSize: 12,
                  background: "rgba(255,66,94,0.1)",
                  border: "1px solid rgba(255,66,94,0.3)",
                  color: "#FF425E",
                  marginBottom: 12,
                }}
              >
                {err}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => !listing && setOpen(false)}
                disabled={listing}
                style={{
                  flex: 1,
                  padding: "12px",
                  fontFamily: "inherit",
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "rgba(255,255,255,0.7)",
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: 6,
                  cursor: listing ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={listing}
                style={{
                  flex: 2,
                  padding: "12px",
                  fontFamily: "inherit",
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#000",
                  background: listing ? "rgba(255,254,178,0.4)" : "#fffeb2",
                  border: "none",
                  borderRadius: 6,
                  cursor: listing ? "not-allowed" : "pointer",
                }}
              >
                {listing ? "Listing…" : "Sign & list"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Row({
  label,
  value,
  accent,
  strong,
}: {
  label: string;
  value: string;
  accent?: string;
  strong?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "4px 0",
        fontSize: 13,
      }}
    >
      <span style={{ color: "rgba(255,255,255,0.6)" }}>{label}</span>
      <span
        style={{
          color: accent ?? "#fff",
          fontWeight: strong ? 700 : 500,
        }}
      >
        {value}
      </span>
    </div>
  );
}
