import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enforceIpLimit } from "@/lib/rateLimit";
import {
  fetchClaimListing,
  verifyTxInvokedCovenant,
} from "@/lib/credit-server";
import { PublicKey } from "@solana/web3.js";

/**
 * POST /api/claims/[id]/cancel
 *
 * Mirror a seller-initiated `cancel_claim`. The on-chain account is
 * closed by the instruction, so after a successful tx we expect
 * `fetchClaimListing` to return null. We verify the tx invoked our
 * program and the PDA is indeed closed, then mark the DB row Cancelled.
 *
 * Body: { sellerWallet, txSignature }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const limited = await enforceIpLimit(req, "cancel_claim");
    if (limited) return limited;
    const body = await req.json();
    const { sellerWallet, txSignature } = body as {
      sellerWallet?: string;
      txSignature?: string;
    };
    if (!sellerWallet || !txSignature) {
      return NextResponse.json(
        { error: "sellerWallet and txSignature are required" },
        { status: 400 },
      );
    }

    const claim = await prisma.claimListing.findUnique({ where: { id } });
    if (!claim) {
      return NextResponse.json({ error: "Claim not found" }, { status: 404 });
    }
    if (claim.status === "Cancelled") {
      return NextResponse.json(
        { claim, note: "already-cancelled" },
        { status: 200 },
      );
    }
    if (claim.status !== "Listed") {
      return NextResponse.json(
        { error: `Only Listed claims can be cancelled (got ${claim.status})` },
        { status: 400 },
      );
    }
    if (claim.sellerWallet !== sellerWallet) {
      return NextResponse.json(
        { error: "Only the original seller can cancel this claim" },
        { status: 403 },
      );
    }

    await verifyTxInvokedCovenant(txSignature);

    // cancel_claim closes the PDA — on success the account should be gone.
    const onchain = await fetchClaimListing(new PublicKey(claim.pda));
    if (onchain) {
      return NextResponse.json(
        {
          error:
            `ClaimListing PDA still exists on chain (status=${onchain.status}). ` +
            "cancel_claim may not have been the supplied tx.",
        },
        { status: 400 },
      );
    }

    const updated = await prisma.claimListing.update({
      where: { id },
      data: {
        status: "Cancelled",
        cancelTxHash: txSignature,
      },
    });

    return NextResponse.json({ claim: updated });
  } catch (error) {
    console.error("POST /api/claims/[id]/cancel error:", error);
    return NextResponse.json(
      {
        error: "Failed to mirror cancel: " +
          (error instanceof Error ? error.message : String(error)),
      },
      { status: 500 },
    );
  }
}
