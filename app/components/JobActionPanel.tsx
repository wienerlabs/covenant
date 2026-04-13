"use client";

import { useState } from "react";
import ChallengeCountdown from "./ChallengeCountdown";
import FinalizeButton from "./FinalizeButton";
import DisputeModal from "./DisputeModal";
import SubmitWorkModal from "./SubmitWorkModal";
import CategoryDeliveryRenderer from "./CategoryDeliveryRenderer";

interface Delivery {
  workHash: string;
  deliveryUri: string;
  contentPreview?: string | null;
  imageUrl?: string | null;
  submittedAt: string;
}

interface Dispute {
  id: string;
  challenger: string;
  bond: number;
  reasonText?: string | null;
  resolution?: string | null;
  approvalCount: number;
  approvedBy: string[];
  resolvedAt?: string | null;
  raisedAt: string;
}

interface JobForPanel {
  id: string;
  status: string;
  posterWallet: string;
  takerWallet?: string | null;
  amount: number;
  challengePeriod: number;
  challengeEndAt?: string | null;
  deliveredAt?: string | null;
  minWords: number;
  category?: string;
  delivery?: Delivery | null;
  dispute?: Dispute | null;
}

interface JobActionPanelProps {
  job: JobForPanel;
  currentWallet?: string | null;
  variant?: "light" | "dark";
  onJobUpdated?: () => void;
}

/**
 * State-specific action panel for a job. Renders the buttons and UI
 * appropriate to the job's current lifecycle state and the connected
 * wallet's role (poster / taker / observer).
 */
export default function JobActionPanel({
  job,
  currentWallet,
  variant = "dark",
  onJobUpdated,
}: JobActionPanelProps) {
  const [submitOpen, setSubmitOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);

  const isDark = variant === "dark";
  const isPoster = currentWallet && currentWallet === job.posterWallet;
  const isTaker = currentWallet && currentWallet === job.takerWallet;
  const challengeEndMs = job.challengeEndAt
    ? new Date(job.challengeEndAt).getTime()
    : 0;
  const now = Date.now();
  const challengeExpired = challengeEndMs > 0 && now >= challengeEndMs;

  // Dispute bond calculation (10% or 1 USDC min)
  const minBond = Math.max(job.amount * 0.1, 1);

  const panel: React.CSSProperties = {
    padding: "20px",
    border: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid #e0e0e0",
    borderRadius: "12px",
    backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "#fafafa",
    color: isDark ? "#ffffff" : "#000000",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  };

  return (
    <div style={panel}>
      <div
        style={{
          fontSize: "10px",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: isDark ? "rgba(255,255,255,0.4)" : "#666",
        }}
      >
        Action Panel — {job.status}
      </div>

      {/* Open: taker can accept */}
      {job.status === "Open" && (
        <div style={{ fontSize: "13px", lineHeight: 1.6 }}>
          This job is waiting for a taker. Connect a wallet and click{" "}
          <strong>Accept</strong> from the job header to claim it.
        </div>
      )}

      {/* Accepted: taker can submit work */}
      {job.status === "Accepted" && (
        <>
          <div style={{ fontSize: "13px", lineHeight: 1.6 }}>
            {isTaker
              ? "Produce your deliverable and submit it to start the challenge period."
              : isPoster
                ? "Waiting for the taker to submit their work."
                : `Waiting for ${truncate(job.takerWallet ?? "")} to submit work.`}
          </div>
          {isTaker && (
            <button
              onClick={() => setSubmitOpen(true)}
              style={{
                padding: "14px 24px",
                borderRadius: "8px",
                border: "1px solid #fffeb2",
                backgroundColor: "rgba(255,227,66,0.1)",
                color: "#fffeb2",
                fontSize: "12px",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                fontFamily: "inherit",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Submit Work
            </button>
          )}
        </>
      )}

      {/* Delivered: countdown + dispute button + finalize button */}
      {job.status === "Delivered" && job.delivery && (
        <>
          <div style={{ fontSize: "13px", lineHeight: 1.6 }}>
            Work delivered. Challenge period is running. If nobody disputes,
            payment auto-releases to the taker.
          </div>

          {challengeEndMs > 0 && (
            <ChallengeCountdown
              endAt={challengeEndMs}
              variant={variant}
              onExpire={onJobUpdated}
            />
          )}

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <FinalizeButton
              jobId={job.id}
              callerWallet={currentWallet ?? undefined}
              enabled={challengeExpired && !job.dispute}
              variant={variant}
              onFinalized={onJobUpdated}
            />
            {isPoster && !challengeExpired && !job.dispute && (
              <button
                onClick={() => setDisputeOpen(true)}
                style={{
                  padding: "12px 28px",
                  borderRadius: "8px",
                  border: "1px solid #FF425E",
                  backgroundColor: "rgba(255,66,94,0.08)",
                  color: "#FF425E",
                  fontSize: "12px",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontFamily: "inherit",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Raise Dispute
              </button>
            )}
          </div>

          {/* Delivery preview */}
          <CategoryDeliveryRenderer category={job.category || "text_writing"} contentPreview={job.delivery.contentPreview} imageUrl={job.delivery.imageUrl} deliveryUri={job.delivery.deliveryUri} isDark={isDark} />
        </>
      )}

      {/* Disputed: waiting for arbitrator */}
      {job.status === "Disputed" && job.dispute && (
        <>
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "8px",
              backgroundColor: "rgba(255,66,94,0.08)",
              border: "1px solid rgba(255,66,94,0.3)",
              fontSize: "13px",
              lineHeight: 1.6,
              color: "#FF425E",
            }}
          >
            <strong>Dispute active</strong> — awaiting arbitrator decision.
            Raised by {truncate(job.dispute.challenger)} with a{" "}
            {job.dispute.bond} USDC bond. Approvals: {job.dispute.approvalCount}
            /2.
          </div>
          {job.dispute.reasonText && (
            <div
              style={{
                fontSize: "12px",
                lineHeight: 1.6,
                color: isDark ? "rgba(255,255,255,0.7)" : "#444",
                padding: "12px 14px",
                borderRadius: "8px",
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.02)"
                  : "#fff",
                border: isDark
                  ? "1px solid rgba(255,255,255,0.08)"
                  : "1px solid #e0e0e0",
              }}
            >
              <div
                style={{
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: isDark ? "rgba(255,255,255,0.4)" : "#999",
                  marginBottom: "6px",
                }}
              >
                Reason
              </div>
              {job.dispute.reasonText}
            </div>
          )}
          {job.delivery && <CategoryDeliveryRenderer category={job.category || "text_writing"} contentPreview={job.delivery.contentPreview} imageUrl={job.delivery.imageUrl} deliveryUri={job.delivery.deliveryUri} isDark={isDark} />}
        </>
      )}

      {/* Finalized */}
      {job.status === "Finalized" && (
        <div
          style={{
            padding: "14px 16px",
            borderRadius: "8px",
            backgroundColor: "rgba(30,158,95,0.08)",
            border: "1px solid rgba(30,158,95,0.3)",
            fontSize: "13px",
            color: "#1E9E5F",
          }}
        >
          <strong>Finalized.</strong> Escrow released to the taker. No dispute
          was raised during the challenge period.
        </div>
      )}

      {/* Resolved */}
      {job.status === "Resolved" && job.dispute && (
        <div
          style={{
            padding: "14px 16px",
            borderRadius: "8px",
            backgroundColor: "rgba(255,227,66,0.08)",
            border: "1px solid rgba(255,227,66,0.3)",
            fontSize: "13px",
            color: "#fffeb2",
          }}
        >
          <strong>Resolved — {job.dispute.resolution}.</strong> Arbitrator
          decision applied. {job.dispute.approvedBy.length} arbitrator
          {job.dispute.approvedBy.length === 1 ? "" : "s"} approved.
        </div>
      )}

      {/* Cancelled */}
      {job.status === "Cancelled" && (
        <div
          style={{
            padding: "14px 16px",
            borderRadius: "8px",
            backgroundColor: "rgba(255,255,255,0.05)",
            fontSize: "13px",
            color: isDark ? "rgba(255,255,255,0.5)" : "#666",
          }}
        >
          Cancelled. Escrow refunded to the poster.
        </div>
      )}

      {/* Modals */}
      {isTaker && (
        <SubmitWorkModal
          open={submitOpen}
          onClose={() => setSubmitOpen(false)}
          jobId={job.id}
          takerWallet={currentWallet as string}
          minWords={job.minWords}
          category={job.category}
          variant={variant}
          onSubmitted={onJobUpdated}
        />
      )}
      {isPoster && (
        <DisputeModal
          open={disputeOpen}
          onClose={() => setDisputeOpen(false)}
          jobId={job.id}
          posterWallet={currentWallet as string}
          escrowAmount={job.amount}
          minBond={minBond}
          variant={variant}
          onRaised={onJobUpdated}
        />
      )}
    </div>
  );
}

function DeliveryPreview({
  delivery,
  isDark,
}: {
  delivery: Delivery;
  isDark: boolean;
}) {
  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: "8px",
        backgroundColor: isDark ? "rgba(255,255,255,0.02)" : "#fff",
        border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #e0e0e0",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <div
        style={{
          fontSize: "10px",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: isDark ? "rgba(255,255,255,0.4)" : "#999",
        }}
      >
        Delivery
      </div>
      <div style={{ fontSize: "11px", fontFamily: "ui-monospace, monospace" }}>
        <div style={{ opacity: 0.6 }}>work_hash</div>
        <div style={{ wordBreak: "break-all" }}>{delivery.workHash}</div>
        <div style={{ opacity: 0.6, marginTop: "8px" }}>delivery_uri</div>
        <a
          href={delivery.deliveryUri}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "#fffeb2",
            wordBreak: "break-all",
          }}
        >
          {delivery.deliveryUri}
        </a>
      </div>
      {/* Generated image preview */}
      {delivery.imageUrl && (
        <div style={{ marginTop: "6px" }}>
          <div
            style={{
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "#fffeb2",
              marginBottom: "6px",
            }}
          >
            Generated Image
          </div>
          <div
            style={{
              borderRadius: "8px",
              overflow: "hidden",
              border: isDark ? "1px solid rgba(255,254,178,0.2)" : "1px solid #e0d090",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={delivery.imageUrl}
              alt="AI-generated delivery"
              style={{
                width: "100%",
                height: "auto",
                display: "block",
                maxHeight: "400px",
                objectFit: "contain",
                backgroundColor: isDark ? "#0a0a0f" : "#f5f5f5",
              }}
            />
          </div>
        </div>
      )}
      {delivery.contentPreview && (
        <details style={{ marginTop: "6px" }}>
          <summary
            style={{
              fontSize: "11px",
              cursor: "pointer",
              color: isDark ? "rgba(255,255,255,0.5)" : "#666",
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
              backgroundColor: isDark ? "rgba(0,0,0,0.3)" : "#f5f5f5",
              borderRadius: "4px",
            }}
          >
            {delivery.contentPreview}
          </pre>
        </details>
      )}
    </div>
  );
}

function truncate(wallet: string): string {
  if (!wallet) return "";
  return wallet.length > 12 ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}` : wallet;
}
