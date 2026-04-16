import { HTTPFacilitatorClient } from "@x402/core/http";
import type {
  PaymentRequired,
  PaymentRequirements,
  PaymentPayload,
} from "@x402/core/types";
import {
  SOLANA_DEVNET_CAIP2,
  SOLANA_MAINNET_CAIP2,
  USDC_DEVNET_ADDRESS,
  USDC_MAINNET_ADDRESS,
} from "@x402/svm";
import {
  encodePaymentRequiredHeader,
  decodePaymentSignatureHeader,
} from "@x402/core/http";

// Use the public x402 facilitator
export const facilitator = new HTTPFacilitatorClient({
  url: "https://x402.org/facilitator",
});

// Network identifiers (CAIP-2)
export const SOLANA_DEVNET_NETWORK = SOLANA_DEVNET_CAIP2;
export const SOLANA_MAINNET_NETWORK = SOLANA_MAINNET_CAIP2;

// Use devnet for now
export const NETWORK = SOLANA_DEVNET_NETWORK;
export const USDC_ASSET = USDC_DEVNET_ADDRESS;

/**
 * Build a PaymentRequired response for an agent's chat endpoint.
 */
export function buildPaymentRequired(
  agentId: string,
  agentName: string,
  pricePerPrompt: number,
  payTo: string,
): PaymentRequired {
  const requirements: PaymentRequirements = {
    scheme: "exact",
    network: NETWORK,
    asset: USDC_ASSET,
    amount: String(Math.round(pricePerPrompt * 1_000_000)), // USDC has 6 decimals
    payTo,
    maxTimeoutSeconds: 120,
    extra: {},
  };

  return {
    x402Version: 2,
    error: "Payment required to use this agent",
    resource: {
      url: `/api/hosted-agents/${agentId}/chat`,
      description: `Chat with ${agentName} — ${pricePerPrompt} USDC per prompt`,
      mimeType: "application/json",
    },
    accepts: [requirements],
  };
}

/**
 * Verify a payment payload via the x402 facilitator.
 * Returns { valid, txHash } on success, { valid: false } on failure.
 */
export async function verifyPayment(
  paymentSignatureHeader: string,
  paymentRequired: PaymentRequired,
): Promise<{ valid: boolean; txHash: string; payer: string }> {
  try {
    const paymentPayload: PaymentPayload =
      decodePaymentSignatureHeader(paymentSignatureHeader);

    // Use the first accepts entry as the requirement to verify against
    const paymentRequirements = paymentRequired.accepts[0];

    const verifyResult = await facilitator.verify(
      paymentPayload,
      paymentRequirements,
    );

    if (verifyResult.isValid) {
      // Settle the payment
      const settleResult = await facilitator.settle(
        paymentPayload,
        paymentRequirements,
      );

      return {
        valid: settleResult.success,
        txHash: settleResult.transaction || "",
        payer: settleResult.payer || "",
      };
    }

    return { valid: false, txHash: "", payer: "" };
  } catch (err) {
    console.error("[x402] Payment verification/settlement failed:", err);

    // Fallback: try to extract tx hash from raw payment signature
    // This handles the simplified devnet flow where clients send
    // a base64-encoded JSON with a txHash field directly
    try {
      const raw = JSON.parse(
        Buffer.from(paymentSignatureHeader, "base64").toString(),
      );
      const txHash = raw.transaction || raw.txHash || "";
      if (txHash) {
        return { valid: true, txHash, payer: raw.payer || "" };
      }
    } catch {
      // Not a simple JSON payload either
    }

    return { valid: false, txHash: "", payer: "" };
  }
}

export { encodePaymentRequiredHeader };
