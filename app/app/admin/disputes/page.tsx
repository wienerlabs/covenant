"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useConnector } from "@solana/connector/react";
import NavBar from "@/components/NavBar";
import {
  getAnchorProgram,
  deriveJobPda,
  deriveConfigPda,
  deriveBondPda,
  deriveReputationPda,
  PublicKey,
  TOKEN_PROGRAM_ID,
  SystemProgram,
} from "@/lib/anchor-browser";
import { USDC_MINT } from "@/lib/constants";
import { getAssociatedTokenAddress } from "@solana/spl-token";

/**
 * Admin arbitrator workspace — /admin/disputes
 *
 * Lists active disputes and provides resolution controls for whitelisted
 * arbitrator wallets. The v1 multisig requires 2 of 3 distinct arbitrator
 * wallets to approve the same resolution before funds move.
 *
 * Access control happens server-side (the /api/disputes/[id]/resolve
 * endpoint re-checks the wallet against COVENANT_ARBITRATORS); this page
 * is not itself restricted — anyone can see active disputes.
 */

interface Dispute {
  id: string;
  jobId: string;
  challenger: string;
  bond: number;
  reasonText?: string | null;
  reasonHash: string;
  raisedAt: string;
  resolvedAt?: string | null;
  resolution?: string | null;
  takerAmount?: number | null;
  approvedBy: string[];
  approvalCount: number;
  job?: {
    id: string;
    posterWallet: string;
    takerWallet?: string | null;
    amount: number;
    category: string;
    delivery?: {
      workHash: string;
      deliveryUri: string;
      contentPreview?: string | null;
    } | null;
  } | null;
}

type ResolutionKind = "FavorTaker" | "FavorPoster" | "Split";

export default function AdminDisputesPage() {
  const { account } = useConnector();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [votingId, setVotingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/disputes?status=active");
      const body = await res.json();
      // Normalize: API might return { disputes } or an array
      const list: Dispute[] = Array.isArray(body)
        ? body
        : Array.isArray(body.disputes)
          ? body.disputes
          : [];
      setDisputes(list.filter((d) => !d.resolvedAt));
    } catch (err) {
      console.error(err);
      setError("Failed to load disputes");
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connector = useConnector() as any;
  const selectedWallet = connector.selectedWallet;

  async function vote(disputeId: string, kind: ResolutionKind, splitAmount?: number) {
    if (!account) {
      setError("Connect your arbitrator wallet first");
      return;
    }
    setVotingId(disputeId);
    setError(null);
    try {
      // Step 1: Try real on-chain resolve_dispute instruction.
      // Each arbitrator signs their own tx. When threshold is reached
      // (2-of-3), the program distributes escrow + bond per resolution.
      let onChainSig: string | undefined;
      const program = getAnchorProgram(account, selectedWallet);
      if (program) {
        try {
          // Find the dispute's parent job for PDA derivation
          const disputeObj = disputes.find(d => d.id === disputeId);
          if (disputeObj?.job) {
            const posterPk = new PublicKey(disputeObj.job.posterWallet);
            const takerPk = disputeObj.job.takerWallet
              ? new PublicKey(disputeObj.job.takerWallet)
              : null;

            // We need specHash. Job row should have it.
            const jobRes = await fetch(`/api/jobs/${disputeObj.jobId}`);
            if (jobRes.ok) {
              const jobData = await jobRes.json();
              const specHash = new Uint8Array(Buffer.from(jobData.specHash, "hex"));
              const [jobPda] = deriveJobPda(posterPk, specHash);
              const [configPda] = deriveConfigPda();
              const [bondPda] = deriveBondPda(jobPda);

              // Build resolution argument for Anchor
              let resolutionArg: Record<string, unknown>;
              if (kind === "FavorTaker") resolutionArg = { favorTaker: {} };
              else if (kind === "FavorPoster") resolutionArg = { favorPoster: {} };
              else resolutionArg = { split: { takerAmount: splitAmount ?? 0 } };

              // Need token accounts
              const posterAta = await getAssociatedTokenAddress(USDC_MINT, posterPk);
              const takerAta = takerPk
                ? await getAssociatedTokenAddress(USDC_MINT, takerPk)
                : posterAta; // fallback
              const [reputationPda] = takerPk
                ? deriveReputationPda(takerPk)
                : deriveReputationPda(posterPk);

              // Need escrow token account — from job data if available
              // For now we'll let the server handle the actual fund movement
              // if the on-chain instruction fails (escrow ATA discovery is complex)
              onChainSig = await (program.methods as any)
                .resolveDispute(resolutionArg)
                .accounts({
                  arbitrator: new PublicKey(account),
                  config: configPda,
                  jobEscrow: jobPda,
                  poster: posterPk,
                  escrowTokenAccount: posterAta, // placeholder — real escrow ATA needed
                  bondTokenAccount: bondPda,
                  posterTokenAccount: posterAta,
                  takerTokenAccount: takerAta,
                  taker: takerPk ?? posterPk,
                  takerReputation: reputationPda,
                  tokenProgram: TOKEN_PROGRAM_ID,
                  systemProgram: SystemProgram.programId,
                })
                .rpc();
            }
          }
        } catch (anchorErr) {
          console.warn("[resolve] on-chain resolve_dispute failed:", anchorErr);
          // Continue with server-side fallback
        }
      }

      // Step 2: Record on server (DB + server-side fund release fallback)
      const res = await fetch(`/api/disputes/${disputeId}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          arbitratorWallet: account,
          resolution: kind,
          takerAmount: splitAmount,
          onChainSig,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setVotingId(null);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#0e0e12",
        color: "#ffffff",
      }}
    >
      <NavBar activeTab="admin" variant="dark" />

      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          padding: "48px 24px",
        }}
      >
        <div
          style={{
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: "rgba(255,255,255,0.5)",
            marginBottom: "8px",
          }}
        >
          Arbitrator Workspace
        </div>
        <h1
          style={{
            fontSize: "32px",
            fontWeight: 700,
            margin: "0 0 6px",
            letterSpacing: "-0.02em",
          }}
        >
          Active Disputes
        </h1>
        <p
          style={{
            fontSize: "13px",
            color: "rgba(255,255,255,0.6)",
            margin: "0 0 32px",
            lineHeight: 1.6,
            maxWidth: "680px",
          }}
        >
          Review delivered work and raised disputes. Your vote as a whitelisted
          arbitrator (2-of-3 multisig) applies one approval toward a
          resolution. Funds move when the threshold is reached.
        </p>

        {error && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "8px",
              backgroundColor: "rgba(255,66,94,0.1)",
              color: "#FF425E",
              fontSize: "13px",
              marginBottom: "24px",
            }}
          >
            {error}
          </div>
        )}

        {loading && <div style={{ opacity: 0.6 }}>Loading disputes...</div>}

        {!loading && disputes.length === 0 && (
          <div
            style={{
              padding: "40px",
              textAlign: "center",
              border: "1px dashed rgba(255,255,255,0.15)",
              borderRadius: "12px",
              color: "rgba(255,255,255,0.4)",
              fontSize: "13px",
            }}
          >
            No active disputes. The protocol is operating smoothly.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {disputes.map((d) => (
            <DisputeCard
              key={d.id}
              dispute={d}
              disabled={votingId !== null}
              onVote={vote}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DisputeCard({
  dispute,
  disabled,
  onVote,
}: {
  dispute: Dispute;
  disabled: boolean;
  onVote: (id: string, kind: ResolutionKind, splitAmount?: number) => void;
}) {
  const [splitAmount, setSplitAmount] = useState(
    dispute.job ? dispute.job.amount / 2 : 0,
  );
  const alreadyVoted = dispute.approvedBy.length;
  const requires = 2;

  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "12px",
        backgroundColor: "rgba(255,255,255,0.03)",
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: "16px",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "rgba(255,255,255,0.5)",
            }}
          >
            Dispute · Job {dispute.jobId.slice(0, 8)}
          </div>
          <Link
            href={`/job/${dispute.jobId}`}
            style={{
              fontSize: "18px",
              fontWeight: 700,
              color: "#fffeb2",
              textDecoration: "none",
            }}
          >
            View full job →
          </Link>
        </div>
        <div
          style={{
            fontSize: "11px",
            color: "rgba(255,255,255,0.5)",
            fontFamily: "ui-monospace, monospace",
          }}
        >
          Raised {new Date(dispute.raisedAt).toLocaleString()}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "12px",
          fontSize: "12px",
        }}
      >
        <Meta label="Escrow" value={`${dispute.job?.amount ?? "?"} USDC`} />
        <Meta label="Bond" value={`${dispute.bond} USDC`} />
        <Meta label="Challenger" value={truncate(dispute.challenger)} />
        <Meta
          label="Taker"
          value={truncate(dispute.job?.takerWallet ?? "")}
        />
      </div>

      {dispute.reasonText && (
        <div
          style={{
            padding: "14px 16px",
            borderRadius: "8px",
            backgroundColor: "rgba(255,66,94,0.05)",
            border: "1px solid rgba(255,66,94,0.2)",
            fontSize: "13px",
            lineHeight: 1.6,
            color: "rgba(255,255,255,0.9)",
          }}
        >
          <div
            style={{
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "#FF425E",
              marginBottom: "6px",
            }}
          >
            Reason
          </div>
          {dispute.reasonText}
        </div>
      )}

      {dispute.job?.delivery && (
        <div
          style={{
            padding: "14px 16px",
            borderRadius: "8px",
            backgroundColor: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.08)",
            fontSize: "12px",
          }}
        >
          <div
            style={{
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "rgba(255,255,255,0.4)",
              marginBottom: "8px",
            }}
          >
            Delivery
          </div>
          <div style={{ fontFamily: "ui-monospace, monospace" }}>
            <div style={{ opacity: 0.6 }}>work_hash</div>
            <div style={{ wordBreak: "break-all" }}>
              {dispute.job.delivery.workHash}
            </div>
            <div style={{ opacity: 0.6, marginTop: "8px" }}>delivery_uri</div>
            <a
              href={dispute.job.delivery.deliveryUri}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#fffeb2", wordBreak: "break-all" }}
            >
              {dispute.job.delivery.deliveryUri}
            </a>
          </div>
          {dispute.job.delivery.contentPreview && (
            <details style={{ marginTop: "10px" }}>
              <summary
                style={{
                  fontSize: "11px",
                  cursor: "pointer",
                  color: "rgba(255,255,255,0.5)",
                }}
              >
                Preview content
              </summary>
              <pre
                style={{
                  marginTop: "8px",
                  fontSize: "11px",
                  fontFamily: "ui-monospace, monospace",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  maxHeight: "300px",
                  overflowY: "auto",
                  padding: "10px",
                  backgroundColor: "rgba(0,0,0,0.3)",
                  borderRadius: "4px",
                }}
              >
                {dispute.job.delivery.contentPreview}
              </pre>
            </details>
          )}
        </div>
      )}

      <div
        style={{
          padding: "12px 14px",
          borderRadius: "8px",
          backgroundColor: "rgba(255,255,255,0.02)",
          fontSize: "11px",
          color: "rgba(255,255,255,0.5)",
        }}
      >
        <strong style={{ color: "rgba(255,255,255,0.8)" }}>
          Approvals: {alreadyVoted}/{requires}
        </strong>
        {dispute.approvedBy.length > 0 && (
          <span style={{ marginLeft: "8px" }}>
            ({dispute.approvedBy.map(truncate).join(", ")})
          </span>
        )}
        {dispute.resolution && dispute.resolution !== "Pending" && (
          <span style={{ marginLeft: "8px", color: "#fffeb2" }}>
            pending: {dispute.resolution}
          </span>
        )}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          paddingTop: "4px",
        }}
      >
        <div
          style={{
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "rgba(255,255,255,0.4)",
          }}
        >
          Cast your vote
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <VoteButton
            label="Favor Taker"
            color="#1E9E5F"
            disabled={disabled}
            onClick={() => onVote(dispute.id, "FavorTaker")}
          />
          <VoteButton
            label="Favor Poster"
            color="#FF425E"
            disabled={disabled}
            onClick={() => onVote(dispute.id, "FavorPoster")}
          />
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <input
              type="number"
              value={splitAmount}
              min={0}
              max={dispute.job?.amount ?? 0}
              step={0.1}
              onChange={(e) =>
                setSplitAmount(parseFloat(e.target.value) || 0)
              }
              style={{
                width: "80px",
                padding: "8px 10px",
                borderRadius: "6px",
                border: "1px solid rgba(255,255,255,0.15)",
                backgroundColor: "rgba(255,255,255,0.05)",
                color: "#ffffff",
                fontSize: "12px",
                fontFamily: "ui-monospace, monospace",
              }}
            />
            <VoteButton
              label="Split"
              color="#fffeb2"
              disabled={disabled}
              onClick={() => onVote(dispute.id, "Split", splitAmount)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function VoteButton({
  label,
  color,
  disabled,
  onClick,
}: {
  label: string;
  color: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "10px 18px",
        borderRadius: "6px",
        border: `1px solid ${color}`,
        backgroundColor: `${color}1a`,
        color,
        fontSize: "11px",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        fontFamily: "inherit",
        cursor: disabled ? "not-allowed" : "pointer",
        fontWeight: 700,
      }}
    >
      {label}
    </button>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: "9px",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "rgba(255,255,255,0.4)",
          marginBottom: "4px",
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: "ui-monospace, monospace" }}>{value}</div>
    </div>
  );
}

function truncate(wallet: string): string {
  if (!wallet) return "";
  return wallet.length > 12 ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}` : wallet;
}
