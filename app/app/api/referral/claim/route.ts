import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateReferralCode } from "@/lib/referral";

/**
 * POST /api/referral/claim
 * Claim a referral. XP is NOT awarded here — it's awarded on first job
 * completion in /api/agents/fulfill.
 *
 * Body: { referredWallet, referrerWallet }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { referredWallet, referrerWallet } = body as {
      referredWallet?: string;
      referrerWallet?: string;
    };

    if (!referredWallet || !referrerWallet) {
      return NextResponse.json(
        { error: "referredWallet and referrerWallet are required" },
        { status: 400 },
      );
    }

    // Self-referral check
    if (referredWallet === referrerWallet) {
      return NextResponse.json(
        { error: "Cannot refer yourself" },
        { status: 400 },
      );
    }

    // Check if already referred
    const existing = await prisma.referral.findUnique({
      where: { referredWallet },
    });

    if (existing) {
      return NextResponse.json(
        { error: "This wallet has already been referred" },
        { status: 409 },
      );
    }

    const code = generateReferralCode(referrerWallet);

    const referral = await prisma.referral.create({
      data: {
        referrerWallet,
        referredWallet,
        code,
        xpAwarded: false,
      },
    });

    return NextResponse.json(referral);
  } catch (error) {
    console.error("POST /api/referral/claim error:", error);
    return NextResponse.json(
      { error: "Failed to claim referral" },
      { status: 500 },
    );
  }
}
