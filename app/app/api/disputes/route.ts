import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { enforceIpLimit } from "@/lib/rateLimit";

const DEFAULT_BOND_BPS = 1_000; // 10%
const DEFAULT_MIN_BOND_ABSOLUTE = 1; // 1 USDC

/**
 * GET /api/disputes
 *
 * List disputes. Supports query params:
 *   jobId=<id>   — filter to a single job
 *   status=active — only disputes without a resolvedAt
 *   status=resolved — only disputes with a resolvedAt
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (jobId) where.jobId = jobId;
    if (status === "active") where.resolvedAt = null;
    if (status === "resolved") where.resolvedAt = { not: null };

    const disputes = await prisma.dispute.findMany({
      where,
      orderBy: { raisedAt: "desc" },
      take: 50,
      include: {
        job: {
          include: { delivery: true },
        },
      },
    });

    return NextResponse.json(disputes);
  } catch (error) {
    console.error("GET /api/disputes error:", error);
    // Empty array keeps the disputes page renderable on DB failure.
    return NextResponse.json([], { status: 200 });
  }
}

/**
 * POST /api/disputes
 *
 * Raise a new dispute. Used by the frontend fallback path; the canonical
 * entry point is POST /api/jobs/[id]/dispute which this delegates to for
 * the same validation logic.
 */
export async function POST(request: NextRequest) {
  try {
    const limited = await enforceIpLimit(request, "raise_dispute_ip");
    if (limited) return limited;

    const body = await request.json();
    const { jobId, posterWallet, reasonText, bond, txHash } = body as {
      jobId?: string;
      posterWallet?: string;
      reasonText?: string;
      bond?: number;
      txHash?: string;
    };

    if (!jobId || !posterWallet || !reasonText || reasonText.trim().length < 10) {
      return NextResponse.json(
        {
          error: "jobId, posterWallet, and reasonText (>=10 chars) are required",
        },
        { status: 400 },
      );
    }

    const job = await prisma.job.findUnique({
      where: { id: jobId },
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
        { error: "Challenge window has closed" },
        { status: 410 },
      );
    }

    const minBond = Math.max(
      (job.amount * DEFAULT_BOND_BPS) / 10_000,
      DEFAULT_MIN_BOND_ABSOLUTE,
    );
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
      .update(reasonText.trim(), "utf8")
      .digest("hex");

    const dispute = await prisma.$transaction(async (tx) => {
      const d = await tx.dispute.create({
        data: {
          jobId,
          challenger: posterWallet,
          bond: providedBond,
          reasonHash,
          reasonText: reasonText.trim(),
          txHashRaise: txHash,
          resolution: "Pending",
        },
      });
      await tx.job.update({
        where: { id: jobId },
        data: { status: "Disputed" },
      });
      await tx.jobEvent.create({
        data: {
          jobId,
          type: "disputed",
          txSignature:
            txHash ?? "local:disputed:" + crypto.randomBytes(12).toString("hex"),
          wallet: posterWallet,
          amount: providedBond,
          data: {
            challenger: posterWallet,
            bond: providedBond,
            reasonHash,
          },
        },
      });
      return d;
    });

    return NextResponse.json(dispute, { status: 201 });
  } catch (error) {
    console.error("POST /api/disputes error:", error);
    return NextResponse.json(
      { error: "Failed to create dispute" },
      { status: 500 },
    );
  }
}
