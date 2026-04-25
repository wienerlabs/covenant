"use client";

/**
 * Covenant Credit — BNPL marketplace for pending agent payment claims.
 *
 * Features (post-redesign):
 *   - Hero + risk disclosure button + quick-buy-top-APR CTA
 *   - Stats strip (Active TVL / Listed / Bought / Best APR)
 *   - Mode switch: Marketplace / Your positions
 *   - Sort controls (APR / discount / face value / expiry / newest)
 *   - Marketplace table: per-row risk pill, Solscan link, live
 *     countdown, Quick Buy, click to open detail drawer
 *   - "Your pending payments" section (seller-side sell CTA)
 *   - Right sidebar: Live activity feed + Top lenders leaderboard
 *
 * Pitch: "BNPL for AI agents on Solana."
 */

import { useCallback, useEffect, useMemo, useState } from "react";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { useConnector } from "@solana/connector/react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { getAnchorProgram, buyClaimOnChain } from "@/lib/anchor-browser";
import { USDC_MINT, USDC_LOGO_URL } from "@/lib/constants";
import NavBar from "@/components/NavBar";
import SellClaimButton from "@/components/SellClaimButton";
import ActivityFeed from "@/components/credit/ActivityFeed";
import LeaderboardWidget from "@/components/credit/LeaderboardWidget";
import ClaimDetailDrawer, {
  type ClaimRowLite,
} from "@/components/credit/ClaimDetailDrawer";
import {
  RiskPill,
  SolscanLink,
  RiskDisclosureButton,
  formatDuration,
  shortWallet,
  type ReputationSummary,
} from "@/components/credit/CreditHelpers";

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
    status?: string;
  };
}

interface Stats {
  activeTvl: number;
  boughtCount: number;
  settledCount: number;
}

type Mode = "marketplace" | "portfolio";
type SortBy = "apr" | "faceValue" | "listedAt" | "discount" | "expiry";

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

  const [mode, setMode] = useState<Mode>("marketplace");
  const [sortBy, setSortBy] = useState<SortBy>("apr");

  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [stats, setStats] = useState<Stats>({
    activeTvl: 0,
    boughtCount: 0,
    settledCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(
    null,
  );
  const [drawerClaim, setDrawerClaim] = useState<ClaimRowLite | null>(null);

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

  interface PortfolioBuckets {
    sold: ClaimRow[];
    boughtActive: ClaimRow[];
    boughtSettled: ClaimRow[];
    myListings: ClaimRow[];
  }
  const [portfolio, setPortfolio] = useState<PortfolioBuckets>({
    sold: [],
    boughtActive: [],
    boughtSettled: [],
    myListings: [],
  });

  const fetchClaims = useCallback(async () => {
    try {
      const res = await fetch("/api/claims?status=Listed&sortBy=apr&limit=100");
      if (!res.ok) return;
      const json = await res.json();
      setClaims(json.claims ?? []);
      setStats(json.stats ?? { activeTvl: 0, boughtCount: 0, settledCount: 0 });
    } catch (e) {
      console.error("[credit] fetch failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);

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

  const fetchPortfolio = useCallback(async () => {
    if (!account) {
      setPortfolio({
        sold: [],
        boughtActive: [],
        boughtSettled: [],
        myListings: [],
      });
      return;
    }
    try {
      const [asSellerActive, asBuyer, asSellerSettled] = await Promise.all([
        fetch(`/api/claims?sellerWallet=${account}&status=Listed&limit=50`).then((r) => r.json()),
        fetch(`/api/claims?buyerWallet=${account}&limit=100`).then((r) => r.json()),
        fetch(`/api/claims?sellerWallet=${account}&status=Settled&limit=50`).then((r) => r.json()),
      ]);
      const buyerClaims: ClaimRow[] = asBuyer.claims ?? [];
      setPortfolio({
        myListings: asSellerActive.claims ?? [],
        sold: asSellerSettled.claims ?? [],
        boughtActive: buyerClaims.filter((c) => c.status === "Bought"),
        boughtSettled: buyerClaims.filter((c) => c.status === "Settled"),
      });
    } catch (e) {
      console.error("[credit] portfolio fetch failed:", e);
    }
  }, [account]);

  useEffect(() => {
    fetchClaims();
    fetchPendingJobs();
    fetchPortfolio();
    const iv = setInterval(() => {
      fetchClaims();
      fetchPendingJobs();
      fetchPortfolio();
    }, 10_000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  const sortedClaims = useMemo(() => {
    const copy = [...claims];
    switch (sortBy) {
      case "apr":
        return copy.sort((a, b) => b.aprPct - a.aprPct);
      case "faceValue":
        return copy.sort((a, b) => b.faceValue - a.faceValue);
      case "discount":
        return copy.sort((a, b) => b.discountPct - a.discountPct);
      case "expiry":
        return copy.sort(
          (a, b) => a.secondsToChallengeEnd - b.secondsToChallengeEnd,
        );
      case "listedAt":
        return copy.sort(
          (a, b) =>
            new Date(b.listedAt).getTime() - new Date(a.listedAt).getTime(),
        );
    }
  }, [claims, sortBy]);

  const bestApr = useMemo(
    () => (claims.length > 0 ? Math.max(...claims.map((c) => c.aprPct)) : 0),
    [claims],
  );
  const topAprClaim = useMemo(() => {
    const eligible = claims.filter(
      (c) => c.sellerWallet !== account && c.secondsToChallengeEnd > 0,
    );
    if (eligible.length === 0) return null;
    return eligible.reduce(
      (best, c) => (c.aprPct > best.aprPct ? c : best),
      eligible[0],
    );
  }, [claims, account]);

  async function handleBuy(claim: ClaimRow | ClaimRowLite) {
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

      const [buyerAta, sellerAta] = await Promise.all([
        getAssociatedTokenAddress(USDC_MINT, buyerPk),
        getAssociatedTokenAddress(USDC_MINT, sellerPk),
      ]);

      const jobRes = await fetch(`/api/jobs/${claim.jobId}`);
      if (!jobRes.ok) throw new Error("job lookup failed");
      const jobJson = await jobRes.json();
      const specHashHex: string = jobJson.specHash ?? jobJson.job?.specHash;
      if (!specHashHex) throw new Error("job missing specHash");
      const specHash = Uint8Array.from(Buffer.from(specHashHex, "hex"));

      // Slippage / front-run guard — re-fetch the on-chain ClaimListing
      // and verify the price the wallet is about to pay matches the
      // price shown in the UI within a small tolerance. If the seller
      // raised the price between page load and click, refuse rather
      // than silently overpay.
      try {
        const listingRes = await fetch(`/api/claims/${claim.id}`);
        if (listingRes.ok) {
          const listingNow = await listingRes.json();
          const livePrice = Number(listingNow.priceUsdc ?? listingNow.price ?? claim.priceUsdc);
          const uiPrice = Number(claim.priceUsdc);
          if (Number.isFinite(livePrice) && Math.abs(livePrice - uiPrice) > Math.max(0.01, uiPrice * 0.005)) {
            throw new Error(
              `Price changed since you opened this drawer (was $${uiPrice.toFixed(2)}, now $${livePrice.toFixed(2)}). Refresh and try again.`,
            );
          }
        }
      } catch (slipErr) {
        // Re-throw guard errors; swallow lookup failures so a momentary
        // API blip doesn't block a legitimate buy.
        if (slipErr instanceof Error && slipErr.message.includes("Price changed")) {
          throw slipErr;
        }
      }

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
      setDrawerClaim(null);
      await fetchClaims();
      await fetchPortfolio();
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
    <div
      style={{
        minHeight: "100vh",
        background: "#0b0b0b",
        color: "#fff",
        fontFamily: "inherit",
      }}
    >
      <NavBar activeTab="credit" variant="dark" />

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "40px 24px 80px" }}>
        {/* Hero */}
        <div style={{ marginBottom: 32 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div
              style={{
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                color: "#fffeb2",
                fontWeight: 700,
              }}
            >
              Covenant Credit
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <RiskDisclosureButton />
              <a
                href="/credit/dashboard"
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "rgba(255,255,255,0.6)",
                  textDecoration: "none",
                  padding: "4px 10px",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 4,
                  fontWeight: 600,
                }}
              >
                Live dashboard →
              </a>
            </div>
          </div>
          <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.1, marginBottom: 12 }}>
            BNPL for AI agents.
          </div>
          <div
            style={{
              fontSize: 14,
              color: "rgba(255,255,255,0.6)",
              maxWidth: 720,
              lineHeight: 1.5,
              marginBottom: 16,
            }}
          >
            Agents with Delivered jobs can sell their pending payment claims
            at a discount. Lenders earn yield for bearing dispute risk during
            the 24h challenge window. Only makes economic sense on Solana —
            try this on Ethereum and you&apos;d lose money to gas.
          </div>

          {topAprClaim && (
            <button
              onClick={() => setDrawerClaim(topAprClaim as ClaimRowLite)}
              style={{
                padding: "12px 22px",
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#000",
                background: "#fffeb2",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                boxShadow:
                  "0 0 0 1px rgba(255,254,178,0.2), 0 8px 24px rgba(255,254,178,0.12)",
              }}
            >
              ⚡ Quick buy top APR ·{" "}
              {topAprClaim.aprPct >= 1000
                ? Math.round(topAprClaim.aprPct)
                : topAprClaim.aprPct.toFixed(0)}
              %
            </button>
          )}
        </div>

        {/* Stats strip */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <StatCard label="Active TVL" value={`$${stats.activeTvl.toFixed(2)}`} accent="#fffeb2" />
          <StatCard label="Listed" value={String(claims.length)} />
          <StatCard label="Bought" value={String(stats.boughtCount)} />
          <StatCard label="Best APR" value={`${bestApr.toFixed(0)}%`} accent="#7CFF7C" />
        </div>

        {/* Your pending jobs (seller side) */}
        {account && pendingJobs.length > 0 && (
          <div
            style={{
              marginBottom: 24,
              padding: 18,
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
                  padding: "10px 0",
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
                            (new Date(j.challengeEndAt).getTime() - Date.now()) / 1000,
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
                    fetchPortfolio();
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
              background:
                toast.kind === "ok" ? "rgba(124,255,124,0.1)" : "rgba(255,66,94,0.1)",
              border: `1px solid ${toast.kind === "ok" ? "#7CFF7C40" : "#FF425E40"}`,
            }}
          >
            {toast.msg}
          </div>
        )}

        {/* Mode tabs + sort */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 4,
              background: "rgba(255,255,255,0.04)",
              borderRadius: 8,
              padding: 4,
            }}
          >
            <ModeTab active={mode === "marketplace"} onClick={() => setMode("marketplace")}>
              Marketplace
            </ModeTab>
            <ModeTab active={mode === "portfolio"} onClick={() => setMode("portfolio")}>
              Your positions
              {account && portfolio.myListings.length + portfolio.boughtActive.length > 0 && (
                <span
                  style={{
                    marginLeft: 6,
                    padding: "1px 6px",
                    borderRadius: 99,
                    background: "#fffeb2",
                    color: "#000",
                    fontSize: 9,
                    fontWeight: 800,
                  }}
                >
                  {portfolio.myListings.length + portfolio.boughtActive.length}
                </span>
              )}
            </ModeTab>
          </div>

          {mode === "marketplace" && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span
                style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,0.5)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Sort
              </span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                style={{
                  fontFamily: "inherit",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#fff",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 6,
                  padding: "6px 10px",
                  cursor: "pointer",
                }}
              >
                <option value="apr">Highest APR</option>
                <option value="discount">Biggest discount</option>
                <option value="faceValue">Largest face value</option>
                <option value="expiry">Expires soonest</option>
                <option value="listedAt">Newest</option>
              </select>
            </div>
          )}
        </div>

        {/* Main split */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 320px",
            gap: 20,
            alignItems: "flex-start",
          }}
        >
          <div>
            {mode === "marketplace" ? (
              <MarketplaceTable
                claims={sortedClaims}
                loading={loading}
                account={account}
                buying={buying}
                onBuy={handleBuy}
                onRowClick={(c) => setDrawerClaim(c as ClaimRowLite)}
              />
            ) : (
              <PortfolioView
                portfolio={portfolio}
                onRowClick={(c) => setDrawerClaim(c as ClaimRowLite)}
              />
            )}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              position: "sticky",
              top: 20,
            }}
          >
            <ActivityFeed />
            <LeaderboardWidget />
          </div>
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
          A taker with a Delivered job lists their claim at a discounted price —
          they prefer cash now over waiting for the challenge window to expire.
          You buy the claim by paying the seller directly; when finalize_payment
          fires on chain, you receive the full face value instead of the seller.
          If a dispute resolves FavorPoster during the challenge window you lose
          your principal — that risk is priced into every discount.
        </div>
      </div>

      {drawerClaim && (
        <ClaimDetailDrawer
          claim={drawerClaim}
          onClose={() => setDrawerClaim(null)}
          currentWallet={account}
          onBuy={handleBuy}
          buying={buying !== null}
        />
      )}
    </div>
  );
}

// ---- Subcomponents ----

function StatCard({
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
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent ?? "#fff" }}>{value}</div>
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 14px",
        fontFamily: "inherit",
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: active ? "#000" : "rgba(255,255,255,0.7)",
        background: active ? "#fffeb2" : "transparent",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      {children}
    </button>
  );
}

function MarketplaceTable({
  claims,
  loading,
  account,
  buying,
  onBuy,
  onRowClick,
}: {
  claims: ClaimRow[];
  loading: boolean;
  account: string | null;
  buying: string | null;
  onBuy: (c: ClaimRow) => void;
  onRowClick: (c: ClaimRow) => void;
}) {
  return (
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
          gridTemplateColumns:
            "minmax(180px,1.3fr) 150px 90px 80px 80px 110px 110px 100px",
          padding: "12px 18px",
          background: "rgba(255,255,255,0.03)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "rgba(255,255,255,0.5)",
          fontWeight: 700,
          gap: 6,
        }}
      >
        <div>Job</div>
        <div>Seller</div>
        <div>Face</div>
        <div>Price</div>
        <div>Disc.</div>
        <div>APR</div>
        <div>Settles</div>
        <div />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>
          Loading claims…
        </div>
      ) : claims.length === 0 ? (
        <div
          style={{
            padding: 40,
            textAlign: "center",
            color: "rgba(255,255,255,0.4)",
            fontSize: 13,
          }}
        >
          No active listings. Deliver a job and sell the claim to get started.
        </div>
      ) : (
        claims.map((c) => {
          const title =
            ((c.job.specJson as { title?: string } | undefined)?.title as string) ??
            `Job ${c.jobId.slice(0, 6)}`;
          const disabled =
            buying !== null ||
            !account ||
            c.sellerWallet === account ||
            c.secondsToChallengeEnd <= 0;
          return (
            <div
              key={c.id}
              onClick={() => onRowClick(c)}
              style={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(180px,1.3fr) 150px 90px 80px 80px 110px 110px 100px",
                gap: 6,
                padding: "12px 18px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                alignItems: "center",
                fontSize: 13,
                cursor: "pointer",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "rgba(255,255,255,0.02)")
              }
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    marginBottom: 2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {title}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.4)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>{c.job.category}</span>
                  {c.pda && <SolscanLink value={c.pda} label="chain" />}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  minWidth: 0,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
                  {shortWallet(c.sellerWallet)}
                </span>
                {c.reputation && <RiskPill rep={c.reputation} />}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={USDC_LOGO_URL}
                  alt="USDC"
                  width={14}
                  height={14}
                  style={{ borderRadius: "50%" }}
                />
                <span>{c.faceValue.toFixed(2)}</span>
              </div>
              <div style={{ color: "#fffeb2" }}>{c.price.toFixed(2)}</div>
              <div style={{ color: "#7CFF7C" }}>{c.discountPct.toFixed(1)}%</div>
              <div style={{ color: "#7CFF7C", fontWeight: 700 }}>
                {c.aprPct >= 1000
                  ? `${Math.round(c.aprPct)}%`
                  : `${c.aprPct.toFixed(0)}%`}
              </div>
              <div
                style={{
                  color:
                    c.secondsToChallengeEnd > 3600
                      ? "rgba(255,255,255,0.5)"
                      : "#FFB84D",
                  fontSize: 11,
                }}
              >
                {formatDuration(c.secondsToChallengeEnd)}
              </div>
              <div style={{ textAlign: "right" }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onBuy(c);
                  }}
                  disabled={disabled}
                  style={{
                    padding: "6px 12px",
                    fontFamily: "inherit",
                    fontSize: 10,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "#000",
                    background: disabled ? "rgba(255,254,178,0.3)" : "#fffeb2",
                    border: "none",
                    borderRadius: 6,
                    cursor: disabled ? "not-allowed" : "pointer",
                  }}
                >
                  {buying === c.id ? "Buying…" : "Buy"}
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function PortfolioView({
  portfolio,
  onRowClick,
}: {
  portfolio: {
    sold: ClaimRow[];
    boughtActive: ClaimRow[];
    boughtSettled: ClaimRow[];
    myListings: ClaimRow[];
  };
  onRowClick: (c: ClaimRow) => void;
}) {
  const empty =
    portfolio.sold.length === 0 &&
    portfolio.boughtActive.length === 0 &&
    portfolio.boughtSettled.length === 0 &&
    portfolio.myListings.length === 0;

  if (empty) {
    return (
      <div
        style={{
          padding: 60,
          textAlign: "center",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 12,
          color: "rgba(255,255,255,0.5)",
          fontSize: 13,
        }}
      >
        Nothing here yet. List a pending claim or buy one from the marketplace.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PortfolioSection
        title="Your active listings (selling)"
        claims={portfolio.myListings}
        accent="#fffeb2"
        emptyMsg="No active listings."
        onRowClick={onRowClick}
      />
      <PortfolioSection
        title="Your holdings (lender — awaiting settlement)"
        claims={portfolio.boughtActive}
        accent="#4DA6FF"
        emptyMsg="No active holdings."
        onRowClick={onRowClick}
      />
      <PortfolioSection
        title="Settled — yours as lender"
        claims={portfolio.boughtSettled}
        accent="#7CFF7C"
        emptyMsg="Nothing settled yet."
        onRowClick={onRowClick}
      />
      <PortfolioSection
        title="Settled — your jobs (sold paper)"
        claims={portfolio.sold}
        accent="rgba(255,255,255,0.5)"
        emptyMsg="No sold claims yet."
        onRowClick={onRowClick}
      />
    </div>
  );
}

function PortfolioSection({
  title,
  claims,
  accent,
  emptyMsg,
  onRowClick,
}: {
  title: string;
  claims: ClaimRow[];
  accent: string;
  emptyMsg: string;
  onRowClick: (c: ClaimRow) => void;
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: accent,
          fontWeight: 700,
        }}
      >
        {title} · {claims.length}
      </div>
      {claims.length === 0 ? (
        <div style={{ padding: "18px 16px", fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
          {emptyMsg}
        </div>
      ) : (
        claims.map((c) => {
          const title =
            ((c.job.specJson as { title?: string } | undefined)?.title as string) ??
            `Job ${c.jobId.slice(0, 6)}`;
          return (
            <div
              key={c.id}
              onClick={() => onRowClick(c)}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,1fr) 110px 110px 90px 80px",
                gap: 12,
                padding: "10px 16px",
                borderTop: "1px solid rgba(255,255,255,0.04)",
                alignItems: "center",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {title}
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{c.job.category}</div>
              </div>
              <div style={{ color: "rgba(255,255,255,0.7)" }}>
                ${c.faceValue.toFixed(2)} face
              </div>
              <div style={{ color: "#fffeb2" }}>${c.price.toFixed(2)} price</div>
              <div style={{ color: "#7CFF7C" }}>
                {c.aprPct >= 1000
                  ? `${Math.round(c.aprPct)}%`
                  : `${c.aprPct.toFixed(0)}%`}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "rgba(255,255,255,0.5)",
                  textAlign: "right",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontWeight: 700,
                }}
              >
                {c.status}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
