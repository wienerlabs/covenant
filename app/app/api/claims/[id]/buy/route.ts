import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enforceIpLimit } from "@/lib/rateLimit";
import {
  fetchClaimListing,
  verifyTxInvokedCovenant,
} from "@/lib/credit-server";
import { PublicKey } from "@solana/web3.js";
import { requireAuth, requireWalletMatch } from "@/lib/require-auth";
import { log } from "@/lib/logger";

/**
 * POST /api/claims/[id]/buy
 *
 * Mirror a completed on-chain `buy_claim`. The lender has already paid
 * the seller by invoking the instruction in their browser wallet; we
 * verify and mark the DB row Bought.
 *
 * Body: { buyerWallet, txSignature }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const limited = await enforceIpLimit(req, "buy_claim");
    if (limited) return limited;
    const __raw = await req.text();
    const __auth = await requireAuth(req, { rawBody: __raw });
    if (!__auth.ok)
      return NextResponse.json({ error: __auth.reason }, { status: __auth.status });
    const body = __raw ? JSON.parse(__raw) : {};
    const { buyerWallet, txSignature } = body as {
      buyerWallet?: string;
      txSignature?: string;
    };
    if (!buyerWallet || !txSignature) {
      return NextResponse.json(
        { error: "buyerWallet and txSignature are required" },
        { status: 400 },
      );
    }

    // IDOR bind: the signer must control the buyer wallet (the on-chain buyer
    // check below is the primary proof; this binds it to the signer too).
    const __guard = requireWalletMatch(__auth, buyerWallet);
    if (!__guard.ok)
      return NextResponse.json({ error: __guard.reason }, { status: __guard.status });

    const claim = await prisma.claimListing.findUnique({
      where: { id },
    });
    if (!claim) {
      return NextResponse.json({ error: "Claim not found" }, { status: 404 });
    }
    if (claim.status === "Bought" && claim.buyerWallet === buyerWallet) {
      return NextResponse.json(
        { claim, note: "already-bought" },
        { status: 200 },
      );
    }
    if (claim.status !== "Listed") {
      return NextResponse.json(
        { error: `Claim is in status ${claim.status}, expected Listed` },
        { status: 400 },
      );
    }

    await verifyTxInvokedCovenant(txSignature);

    const onchain = await fetchClaimListing(new PublicKey(claim.pda));
    if (!onchain) {
      return NextResponse.json(
        { error: "ClaimListing PDA missing on chain after buy tx confirmed" },
        { status: 400 },
      );
    }
    if (onchain.status !== "Bought") {
      return NextResponse.json(
        {
          error: `On-chain status is ${onchain.status}, expected Bought. ` +
            "Tx may not have been a buy_claim for this listing.",
        },
        { status: 400 },
      );
    }
    if (onchain.buyer !== buyerWallet) {
      return NextResponse.json(
        { error: "On-chain buyer does not match buyerWallet in request" },
        { status: 400 },
      );
    }

    const updated = await prisma.claimListing.update({
      where: { id },
      data: {
        status: "Bought",
        buyerWallet,
        boughtAt: onchain.boughtAt > 0 ? new Date(onchain.boughtAt * 1000) : new Date(),
        buyTxHash: txSignature,
      },
    });

    log.forRequest(req).info("claim bought", {
      claimId: id,
      buyer: buyerWallet,
      txHash: txSignature,
    });

    return NextResponse.json({ claim: updated });
  } catch (error) {
    console.error("POST /api/claims/[id]/buy error:", error);
    return NextResponse.json(
      {
        error: "Failed to mirror buy: " +
          (error instanceof Error ? error.message : String(error)),
      },
      { status: 500 },
    );
  }
}
