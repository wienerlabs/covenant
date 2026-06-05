/**
 * x402 consumed-payment store — durable replay protection (C-032) and
 * idempotent payment-gated serving (C-036).
 *
 * A verified payment signature can be spent exactly once. The signature
 * is the natural idempotency key: the first request that presents a
 * verified payment reserves it; a later request presenting the SAME
 * signature either
 *   - replays the SAME request (same prompt) ⇒ gets the cached response
 *     byte-for-byte, with no second charge (C-036), or
 *   - presents a DIFFERENT request (a second prompt) ⇒ is rejected
 *     because the payment is already consumed (C-032).
 *
 * Persistence is the `X402Payment` table so the guarantee survives
 * serverless cold starts — an in-memory map would let an attacker replay
 * a consumed signature after an instance recycle.
 */

import crypto from "node:crypto";

/**
 * Lazily load the Prisma client. Kept out of module scope so importing
 * the pure helpers (`hashPaymentRequest`, `decidePaymentClaim`) does not
 * pull in the DB client or fire its cold-start schema sync.
 */
async function db() {
  return import("./prisma");
}

/**
 * Stable fingerprint of the served request, used to tell an idempotent
 * retry (same prompt) apart from a replay attack (same payment, new
 * prompt). Bound to the agent + the exact message that was paid for.
 */
export function hashPaymentRequest(agentId: string, message: string): string {
  return crypto
    .createHash("sha256")
    .update(`${agentId}\n${message}`)
    .digest("hex");
}

export interface ConsumedPaymentRecord {
  requestHash: string;
  responseBody: string | null;
  responseCode: number | null;
}

export type PaymentClaimDecision =
  | { kind: "fresh" }
  | { kind: "replay"; body: string; code: number }
  | { kind: "consumed" }
  | { kind: "pending" };

/**
 * Pure decision: given the stored record for a payment signature (or
 * null) and the incoming request fingerprint, decide how to handle the
 * request. No IO — unit-tested in isolation.
 *
 *   null                              ⇒ fresh    (first use, proceed)
 *   same request + finalized response ⇒ replay   (serve cached, C-036)
 *   same request + still in flight    ⇒ pending  (concurrent duplicate)
 *   different request                 ⇒ consumed (replay attack, C-032)
 */
export function decidePaymentClaim(
  existing: ConsumedPaymentRecord | null,
  incomingRequestHash: string,
): PaymentClaimDecision {
  if (!existing) return { kind: "fresh" };
  if (existing.requestHash !== incomingRequestHash) return { kind: "consumed" };
  if (existing.responseBody != null && existing.responseCode != null) {
    return { kind: "replay", body: existing.responseBody, code: existing.responseCode };
  }
  return { kind: "pending" };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "P2002"
  );
}

export interface ClaimPaymentInput {
  txSignature: string;
  agentId: string;
  payer: string;
  amountAtomic: string;
  requestHash: string;
}

/**
 * Claim a verified payment for serving. On first use this atomically
 * reserves the signature (so concurrent duplicates can't both proceed),
 * and returns the decision for this request. The `txSignature` primary
 * key makes the reserve race-safe: a concurrent insert loses with a
 * unique-constraint error and falls back to reading the winner's row.
 */
export async function claimPayment(
  input: ClaimPaymentInput,
): Promise<PaymentClaimDecision> {
  const { prisma, retryable } = await db();

  const existing = await retryable(() =>
    prisma.x402Payment.findUnique({ where: { txSignature: input.txSignature } }),
  );
  if (existing) {
    return decidePaymentClaim(existing, input.requestHash);
  }

  try {
    await retryable(() =>
      prisma.x402Payment.create({
        data: {
          txSignature: input.txSignature,
          agentId: input.agentId,
          payer: input.payer,
          amountAtomic: input.amountAtomic,
          requestHash: input.requestHash,
        },
      }),
    );
    return { kind: "fresh" };
  } catch (err) {
    if (isUniqueViolation(err)) {
      const raced = await retryable(() =>
        prisma.x402Payment.findUnique({
          where: { txSignature: input.txSignature },
        }),
      );
      if (raced) return decidePaymentClaim(raced, input.requestHash);
    }
    throw err;
  }
}

/**
 * Record the served response against a reserved payment so an
 * idempotent retry can replay it (C-036). Best-effort: if this fails the
 * row stays reserved and a later retry is treated as `pending`.
 */
export async function finalizePayment(
  txSignature: string,
  body: string,
  code: number,
): Promise<void> {
  try {
    const { prisma, retryable } = await db();
    await retryable(() =>
      prisma.x402Payment.update({
        where: { txSignature },
        data: { responseBody: body, responseCode: code },
      }),
    );
  } catch (err) {
    console.error("[x402] finalizePayment failed:", err);
  }
}

/**
 * Release a reserved (not-yet-finalized) payment so the payer can retry
 * the same payment after a server-side failure — they paid on chain, so
 * an error must not burn their payment.
 */
export async function releasePayment(txSignature: string): Promise<void> {
  try {
    const { prisma, retryable } = await db();
    await retryable(() =>
      prisma.x402Payment.delete({ where: { txSignature } }),
    );
  } catch {
    /* already gone or never reserved — fine */
  }
}

/* ------------------------------------------------------------------ */
/*  C-037 — revenue reconciliation against verified payments           */
/* ------------------------------------------------------------------ */

export interface RevenueReconciliation {
  /** Sum of recorded AgentRevenue, in atomic units. */
  revenueAtomic: string;
  /** Sum of verified on-chain payments, in atomic units. */
  verifiedAtomic: string;
  /** revenue − verified, in atomic units (0 when in sync). */
  driftAtomic: string;
  reconciled: boolean;
}

/**
 * Compare recorded revenue against verified on-chain payments, in atomic
 * units to avoid float drift (C-037). Pure — unit-tested in isolation.
 */
export function reconcileRevenue(
  revenueAmounts: number[],
  verifiedAtomic: string[],
  decimals = 6,
): RevenueReconciliation {
  const factor = 10 ** decimals;
  const rev = revenueAmounts.reduce(
    (sum, a) => sum + BigInt(Math.round(a * factor)),
    0n,
  );
  const ver = verifiedAtomic.reduce((sum, a) => sum + BigInt(a || "0"), 0n);
  return {
    revenueAtomic: rev.toString(),
    verifiedAtomic: ver.toString(),
    driftAtomic: (rev - ver).toString(),
    reconciled: rev === ver,
  };
}

/**
 * Reconcile an agent's recorded revenue against its served verified
 * payments (C-037). The revenue dashboard total (sum of AgentRevenue) must
 * equal the sum of verified on-chain payments; this surfaces any drift.
 */
export async function reconcileAgentRevenue(
  agentId: string,
): Promise<RevenueReconciliation> {
  const { prisma, retryable } = await db();
  const [revenue, payments] = await Promise.all([
    retryable(() =>
      prisma.agentRevenue.findMany({
        where: { agentId, paymentTx: { not: null } },
        select: { amount: true },
      }),
    ),
    retryable(() =>
      prisma.x402Payment.findMany({
        where: { agentId, responseBody: { not: null } },
        select: { amountAtomic: true },
      }),
    ),
  ]);
  return reconcileRevenue(
    revenue.map((r) => r.amount),
    payments.map((p) => p.amountAtomic),
  );
}
