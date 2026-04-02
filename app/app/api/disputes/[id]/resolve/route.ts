import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/disputes/[id]/resolve — resolve a dispute
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { resolution, resolvedBy } = body;

    if (!resolution || !["poster", "taker", "dismissed"].includes(resolution)) {
      return NextResponse.json(
        { error: "resolution must be one of: poster, taker, dismissed" },
        { status: 400 }
      );
    }
    if (!resolvedBy || typeof resolvedBy !== "string") {
      return NextResponse.json(
        { error: "resolvedBy (wallet address) is required" },
        { status: 400 }
      );
    }

    const dispute = await prisma.dispute.findUnique({ where: { id } });
    if (!dispute) {
      return NextResponse.json(
        { error: "Dispute not found" },
        { status: 404 }
      );
    }
    if (dispute.status !== "open") {
      return NextResponse.json(
        { error: "Dispute is already resolved" },
        { status: 400 }
      );
    }

    const job = await prisma.job.findUnique({ where: { id: dispute.jobId } });
    if (!job) {
      return NextResponse.json(
        { error: "Associated job not found" },
        { status: 404 }
      );
    }

    const statusMap: Record<string, string> = {
      poster: "resolved_poster",
      taker: "resolved_taker",
      dismissed: "dismissed",
    };

    const updatedDispute = await prisma.$transaction(async (tx) => {
      const d = await tx.dispute.update({
        where: { id },
        data: {
          status: statusMap[resolution],
          resolution: `Resolved in favor of ${resolution} by ${resolvedBy}`,
        },
      });

      if (resolution === "poster") {
        // Resolved for poster: revert job, increment taker's jobsFailed
        await tx.job.update({
          where: { id: dispute.jobId },
          data: { status: "Accepted" }, // Revert to Accepted so poster can reassign
        });

        if (job.takerWallet) {
          await tx.reputation.upsert({
            where: { walletAddress: job.takerWallet },
            create: {
              walletAddress: job.takerWallet,
              jobsFailed: 1,
              totalEarned: 0,
            },
            update: {
              jobsFailed: { increment: 1 },
              // Also decrement jobsCompleted if it was previously counted
              jobsCompleted: { decrement: 1 },
              totalEarned: { decrement: job.amount },
            },
          });
        }
      } else if (resolution === "taker") {
        // Resolved for taker: keep job Completed
        await tx.job.update({
          where: { id: dispute.jobId },
          data: { status: "Completed" },
        });
      } else {
        // Dismissed: revert to Completed
        await tx.job.update({
          where: { id: dispute.jobId },
          data: { status: "Completed" },
        });
      }

      return d;
    });

    return NextResponse.json(updatedDispute);
  } catch (error) {
    console.error("POST /api/disputes/[id]/resolve error:", error);
    return NextResponse.json(
      { error: "Failed to resolve dispute" },
      { status: 500 }
    );
  }
}
