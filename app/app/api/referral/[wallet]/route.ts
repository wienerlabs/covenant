import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateReferralCode } from "@/lib/referral";

/**
 * GET /api/referral/[wallet]
 * Returns referral code + stats for a wallet.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ wallet: string }> },
) {
  try {
    const { wallet } = await params;

    if (!wallet) {
      return NextResponse.json(
        { error: "wallet param required" },
        { status: 400 },
      );
    }

    const code = generateReferralCode(wallet);

    // Count referrals made by this wallet
    const referrals = await prisma.referral.findMany({
      where: { referrerWallet: wallet },
    });

    const referralCount = referrals.length;
    const totalXpFromReferrals = referrals.filter((r) => r.xpAwarded).length * 30;

    return NextResponse.json({
      code,
      referralCount,
      totalXpFromReferrals,
    });
  } catch (error) {
    console.error("GET /api/referral/[wallet] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch referral info" },
      { status: 500 },
    );
  }
}
