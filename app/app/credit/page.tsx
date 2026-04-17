"use client";

/**
 * Covenant Credit — BNPL marketplace for pending agent payment claims.
 *
 * Sellers (takers with Delivered jobs) list their pending payment
 * claims at a discount. Lenders (buyers) purchase them, get the full
 * face value when the challenge period expires.
 *
 * Pitch: "BNPL for AI agents on Solana."
 */

import { useCallback, useEffect, useMemo, useState } from "react";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { useConnector } from "@solana/connector/react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import {
  getAnchorProgram,
  buyClaimOnChain,
} from "@/lib/anchor-browser";
import { USDC_MINT, USDC_LOGO_URL } from "@/lib/constants";
import NavBar from "@/components/NavBar";
import SellClaimButton from "@/components/SellClaimButton";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface ClaimRow {
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
  discountPct: number;
  aprPct: number;
  secondsToChallengeEnd: number;
  job: {
    id: string;
    posterWallet: string;
    category: string;
    amount: number;
    specJson: Record<string, unknown>;
    challengeEndAt: string | null;
  };
}

interface Stats {
  activeTvl: number;
  boughtCount: number;
  settledCount: number;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "expired";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  const s = Math.max(0, seconds - m * 60);
  return `${m}m ${s}s`;
}

function shortWallet(w: string): string {
  return w.length > 10 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w;
}

export default function CreditMarketplacePage() {
  const connector = useConnector();
  const account =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (connector as any)?.account?.address ??
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (connector as any)?.selectedWallet?.accounts?.[0]?.address ??
    null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selectedWallet = (connector as any)?.selectedWallet ?? null;

  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [stats, setStats] = useState<Stats>({
    activeTvl: 0,
    boughtCount: 0,
    settledCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  // "Your pending jobs" — Delivered jobs the connected wallet took, for
  // which no listing exists yet (i.e. listable right now).
  interface PendingJob {
    id: string;
    specHash: string;
    posterWallet: string;
    takerWallet: string;
    amount: number;
    specJson: Record<string, unknown>;
    challengeEndAt: string | null;
    claim: { id: string; status: string } | null;
  }
  const [pendingJobs, setPendingJobs] = useState<PendingJob[]>([]);

  const fetchPendingJobs = useCallback(async () => {
    if (!account) {
      setPendingJobs([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/jobs?status=Delivered&taker=${encodeURIComponent(account)}&limit=20`,
      );
      if (!res.ok) return;
      const json = await res.json();
      const jobs: PendingJob[] = (json.jobs ?? []).filter(
        (j: PendingJob) => !j.claim,
      );
      setPendingJobs(jobs);
    } catch (e) {
      console.error("[credit] pending fetch failed:", e);
    }
  }, [account]);

  const fetchClaims = useCallback(async () => {
    try {
      const res = await fetch("/api/claims?status=Listed&sortBy=apr&limit=50");
      if (!res.ok) return;
      const json = await res.json();
      setClaims(json.claims ?? []);
      setStats(json.stats ?? stats);
    } catch (e) {
      console.error("[credit] fetch failed:", e);
    } finally {
      setLoading(false);
    }
  }, [stats]);

  useEffect(() => {
    fetchClaims();
    fetchPendingJobs();
    const iv = setInterval(() => {
      fetchClaims();
      fetchPendingJobs();
    }, 10_000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  const bestApr = useMemo(
    () => (claims.length > 0 ? Math.max(...claims.map((c) => c.aprPct)) : 0),
    [claims],
  );

  async function handleBuy(claim: ClaimRow) {
    if (!account || !selectedWallet) {
      setToast({ kind: "err", msg: "Connect your wallet to buy claims." });
      return;
    }
    if (claim.sellerWallet === account) {
      setToast({ kind: "err", msg: "You can't buy your own listing." });
      return;
    }
    setBuying(claim.id);
    setToast(null);
    try {
      const program = getAnchorProgram(account, selectedWallet);
      if (!program) throw new Error("wallet program unavailable");

      const buyerPk = new PublicKey(account);
      const sellerPk = new PublicKey(claim.sellerWallet);
      const posterPk = new PublicKey(claim.job.posterWallet);

      // Derive ATAs from the USDC mint + wallet pubkeys.
      const [buyerAta, sellerAta] = await Promise.all([
        getAssociatedTokenAddress(USDC_MINT, buyerPk),
        getAssociatedTokenAddress(USDC_MINT, sellerPk),
      ]);

      // Fetch the Job to get the 32-byte specHash.
      const jobRes = await fetch(`/api/jobs/${claim.jobId}`);
      if (!jobRes.ok) throw new Error("job lookup failed");
      const jobJson = await jobRes.json();
      const specHashHex: string = jobJson.specHash ?? jobJson.job?.specHash;
      if (!specHashHex) throw new Error("job missing specHash");
      const specHash = Uint8Array.from(Buffer.from(specHashHex, "hex"));

      const { sig } = await buyClaimOnChain({
        program,
        buyer: buyerPk,
        poster: posterPk,
        specHash,
        buyerTokenAccount: buyerAta,
        sellerTokenAccount: sellerAta,
      });

      const mirrorRes = await fetch(`/api/claims/${claim.id}/buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyerWallet: account, txSignature: sig }),
      });
      if (!mirrorRes.ok) {
        const txt = await mirrorRes.text();
        throw new Error(`mirror failed: ${txt}`);
      }

      setToast({
        kind: "ok",
        msg:
          `Bought ${claim.faceValue.toFixed(2)} USDC claim for ` +
          `${claim.price.toFixed(2)} USDC. Settlement in ` +
          `${formatDuration(claim.secondsToChallengeEnd)}.`,
      });
      await fetchClaims();
    } catch (e) {
      console.error("[credit] buy failed:", e);
      setToast({
        kind: "err",
        msg: "Buy failed: " + (e instanceof Error ? e.message : String(e)),
      });
    } finally {
      setBuying(null);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0b0b0b", color: "#fff", fontFamily: "inherit" }}>
      <NavBar activeTab="credit" variant="dark" />

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px 80px" }}>
        {/* Hero */}
        <div style={{ marginBottom: 32 }}>
          <div
            style={{
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: "#fffeb2",
              marginBottom: 8,
            }}
          >
            Covenant Credit
          </div>
          <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.1, marginBottom: 12 }}>
            BNPL for AI agents.
          </div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", maxWidth: 720, lineHeight: 1.5 }}>
            Agents with Delivered jobs can sell their pending payment claims at a discount.
            Lenders earn yield for bearing dispute risk during the 24h challenge window.
            Only makes economic sense on Solana — try this on Ethereum and you&apos;d lose money to gas.
          </div>
        </div>

        {/* Stats strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 32 }}>
          <StatCard label="Active TVL" value={`$${stats.activeTvl.toFixed(2)}`} accent="#fffeb2" />
          <StatCard label="Listed" value={String(claims.length)} />
          <StatCard label="Bought" value={String(stats.boughtCount)} />
          <StatCard label="Best APR" value={`${bestApr.toFixed(0)}%`} accent="#7CFF7C" />
        </div>

        {/* Your pending jobs (Delivered, no listing yet) */}
        {account && pendingJobs.length > 0 && (
          <div
            style={{
              marginBottom: 32,
              padding: 20,
              background: "rgba(255,254,178,0.05)",
              border: "1px solid rgba(255,254,178,0.25)",
              borderRadius: 12,
            }}
          >
            <div
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#fffeb2",
                marginBottom: 12,
                fontWeight: 700,
              }}
            >
              Your pending payments — sell any of these instantly
            </div>
            {pendingJobs.map((j) => (
              <div
                key={j.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "12px 0",
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                  fontSize: 13,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>
                    {((j.specJson as { title?: string } | undefined)?.title) ??
                      `Job ${j.id.slice(0, 6)}`}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                    {j.amount.toFixed(2)} USDC — settles in{" "}
                    {j.challengeEndAt
                      ? formatDuration(
                          Math.round(
                            (new Date(j.challengeEndAt).getTime() - Date.now()) /
                              1000,
                          ),
                        )
                      : "—"}
                  </div>
                </div>
                <SellClaimButton
                  jobId={j.id}
                  posterWallet={j.posterWallet}
                  takerWallet={j.takerWallet}
                  specHashHex={j.specHash}
                  faceValue={j.amount}
                  onListed={() => {
                    fetchClaims();
                    fetchPendingJobs();
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div
            style={{
              marginBottom: 20,
              padding: "12px 16px",
              borderRadius: 8,
              fontSize: 13,
              color: toast.kind === "ok" ? "#7CFF7C" : "#FF425E",
              background: toast.kind === "ok" ? "rgba(124,255,124,0.1)" : "rgba(255,66,94,0.1)",
              border: `1px solid ${toast.kind === "ok" ? "#7CFF7C40" : "#FF425E40"}`,
            }}
          >
            {toast.msg}
          </div>
        )}

        {/* Table */}
        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(160px,1.2fr) 100px 100px 90px 90px 140px 140px 120px",
              padding: "14px 20px",
              background: "rgba(255,255,255,0.03)",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "rgba(255,255,255,0.5)",
            }}
          >
            <div>Job</div>
            <div>Category</div>
            <div>Face value</div>
            <div>Price</div>
            <div>Discount</div>
            <div>APR (annual)</div>
            <div>Settles in</div>
            <div />
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>
              Loading claims…
            </div>
          ) : claims.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>
              No active listings. An agent needs to deliver a job and sell the claim first.
            </div>
          ) : (
            claims.map((c) => (
              <div
                key={c.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(160px,1.2fr) 100px 100px 90px 90px 140px 140px 120px",
                  padding: "14px 20px",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  alignItems: "center",
                  fontSize: 13,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>
                    {((c.job.specJson as { title?: string } | undefined)?.title as string) ??
                      `Job ${c.jobId.slice(0, 6)}`}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                    seller {shortWallet(c.sellerWallet)}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{c.job.category}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={USDC_LOGO_URL} alt="USDC" width={14} height={14} style={{ borderRadius: "50%" }} />
                  <span>{c.faceValue.toFixed(2)}</span>
                </div>
                <div style={{ color: "#fffeb2" }}>{c.price.toFixed(2)}</div>
                <div style={{ color: "#7CFF7C" }}>{c.discountPct.toFixed(1)}%</div>
                <div style={{ color: "#7CFF7C", fontWeight: 700 }}>
                  {c.aprPct >= 1000 ? `${Math.round(c.aprPct)}%` : `${c.aprPct.toFixed(0)}%`}
                </div>
                <div
                  style={{
                    color:
                      c.secondsToChallengeEnd > 3600
                        ? "rgba(255,255,255,0.5)"
                        : "#FFB84D",
                  }}
                >
                  {formatDuration(c.secondsToChallengeEnd)}
                </div>
                <div style={{ textAlign: "right" }}>
                  <button
                    onClick={() => handleBuy(c)}
                    disabled={
                      buying !== null ||
                      !account ||
                      c.sellerWallet === account ||
                      c.secondsToChallengeEnd <= 0
                    }
                    style={{
                      padding: "6px 14px",
                      fontFamily: "inherit",
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "#000",
                      background:
                        buying !== null ||
                        !account ||
                        c.sellerWallet === account ||
                        c.secondsToChallengeEnd <= 0
                          ? "rgba(255,254,178,0.3)"
                          : "#fffeb2",
                      border: "none",
                      borderRadius: 6,
                      cursor:
                        buying !== null ||
                        !account ||
                        c.sellerWallet === account ||
                        c.secondsToChallengeEnd <= 0
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    {buying === c.id ? "Buying…" : "Buy claim"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer explainer */}
        <div
          style={{
            marginTop: 40,
            padding: 20,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 10,
            fontSize: 12,
            color: "rgba(255,255,255,0.5)",
            lineHeight: 1.6,
          }}
        >
          <b style={{ color: "#fffeb2" }}>How it works.</b>{" "}
          A taker with a Delivered job lists their claim at a discounted price — they prefer
          cash now over waiting for the challenge window to expire. You buy the claim by paying
          the seller directly; when finalize_payment fires on chain, you receive the full face
          value instead of the seller. If a dispute resolves FavorPoster during the challenge
          window you lose your principal — that risk is priced into every discount.
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        padding: "16px 18px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "rgba(255,255,255,0.45)",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent ?? "#fff" }}>{value}</div>
    </div>
  );
}
