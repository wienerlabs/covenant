import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

const DEFAULT_BOND_BPS = 1_000; // 10%
const DEFAULT_MIN_BOND_ABSOLUTE = 1; // 1 USDC

/**
 * POST /api/jobs/[id]/dispute
 *
 * Poster raises a dispute against a Delivered job within its challenge
 * window. This writes the off-chain reason + bond to the DB and expects
 * the caller to have submitted the matching `raise_dispute` on-chain
 * transaction (tx signature passed in `txHash`).
 *
 * Body: { posterWallet, reasonText, bond, txHash? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      posterWallet,
      reasonText,
      bond,
      txHash,
    } = body as {
      posterWallet?: string;
      reasonText?: string;
      bond?: number;
      txHash?: string;
    };

    if (!posterWallet) {
      return NextResponse.json(
        { error: "posterWallet is required" },
        { status: 400 },
      );
    }
    if (!reasonText || reasonText.length < 10) {
      return NextResponse.json(
        { error: "reasonText must be at least 10 characters" },
        { status: 400 },
      );
    }

    const job = await prisma.job.findUnique({
      where: { id },
      include: { dispute: true },
    });
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (job.status !== "Delivered") {
      return NextResponse.json(
        {
          error: `Job is in status '${job.status}'; dispute requires 'Delivered'`,
        },
        { status: 400 },
      );
    }
    if (job.posterWallet !== posterWallet) {
      return NextResponse.json(
        { error: "Only the poster can raise a dispute" },
        { status: 403 },
      );
    }
    if (job.dispute) {
      return NextResponse.json(
        { error: "Dispute already exists for this job" },
        { status: 409 },
      );
    }
    if (!job.challengeEndAt || job.challengeEndAt.getTime() <= Date.now()) {
      return NextResponse.json(
        {
          error: "Challenge window has closed; job will auto-finalize soon",
        },
        { status: 410 },
      );
    }

    // Enforce minimum bond: max(10% of escrow, 1 USDC)
    const minBondFromBps = (job.amount * DEFAULT_BOND_BPS) / 10_000;
    const minBond = Math.max(minBondFromBps, DEFAULT_MIN_BOND_ABSOLUTE);
    const providedBond = typeof bond === "number" ? bond : minBond;
    if (providedBond < minBond) {
      return NextResponse.json(
        {
          error: `Bond of ${providedBond} is below minimum ${minBond}`,
          minBond,
        },
        { status: 400 },
      );
    }

    const reasonHash = crypto
      .createHash("sha256")
      .update(reasonText, "utf8")
      .digest("hex");

    const dispute = await prisma.$transaction(async (tx) => {
      const d = await tx.dispute.create({
        data: {
          jobId: id,
          challenger: posterWallet,
          bond: providedBond,
          reasonHash,
          reasonText,
          txHashRaise: txHash,
          resolution: "Pending",
        },
      });
      await tx.job.update({
        where: { id },
        data: { status: "Disputed" },
      });
      await tx.jobEvent.create({
        data: {
          jobId: id,
          type: "disputed",
          txSignature:
            txHash ?? "local:disputed:" + crypto.randomBytes(12).toString("hex"),
          wallet: posterWallet,
          amount: providedBond,
          data: {
            reasonHash,
            bond: providedBond,
            challenger: posterWallet,
          },
        },
      });
      return d;
    });

    return NextResponse.json({
      dispute,
      reasonHash,
      minBond,
    });
  } catch (error) {
    console.error("POST /api/jobs/[id]/dispute error:", error);
    return NextResponse.json(
      { error: "Failed to raise dispute" },
      { status: 500 },
    );
  }
}
