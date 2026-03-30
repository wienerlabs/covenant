import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMarkerTransaction } from "@/lib/solana";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { signerWallet } = body;

    if (!signerWallet || typeof signerWallet !== "string") {
      return NextResponse.json(
        { error: "signerWallet is required" },
        { status: 400 }
      );
    }

    const job = await prisma.job.findUnique({ where: { id } });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Case 1: Open job can be cancelled by poster
    if (job.status === "Open" && signerWallet === job.posterWallet) {
      const updatedJob = await prisma.job.update({
        where: { id },
        data: { status: "Cancelled" },
      });

      // Send Solana marker transaction (non-blocking)
      let txHash: string | null = null;
      try {
        txHash = await sendMarkerTransaction("cancel_job:" + id);
        await prisma.transaction.create({
          data: {
            txHash,
            type: "cancel_job",
            jobId: id,
            wallet: signerWallet,
            amount: job.amount,
            status: "confirmed",
          },
        });
      } catch (err) {
        console.error("[solana] Failed to send marker tx for cancel_job:", err);
      }

      return NextResponse.json({ ...updatedJob, txHash });
    }

    // Case 2: Accepted job can be cancelled after deadline passes
    if (job.status === "Accepted" && new Date() > job.deadline) {
      const updatedJob = await prisma.$transaction(async (tx) => {
        const updated = await tx.job.update({
          where: { id },
          data: { status: "Cancelled" },
        });

        if (job.takerWallet) {
          await tx.reputation.upsert({
            where: { walletAddress: job.takerWallet },
            create: {
              walletAddress: job.takerWallet,
              jobsFailed: 1,
            },
            update: {
              jobsFailed: { increment: 1 },
            },
          });
        }

        return updated;
      });

      // Send Solana marker transaction (non-blocking)
      let txHash: string | null = null;
      try {
        txHash = await sendMarkerTransaction("cancel_job:" + id);
        await prisma.transaction.create({
          data: {
            txHash,
            type: "cancel_job",
            jobId: id,
            wallet: signerWallet,
            amount: job.amount,
            status: "confirmed",
          },
        });
      } catch (err) {
        console.error("[solana] Failed to send marker tx for cancel_job:", err);
      }

      return NextResponse.json({ ...updatedJob, txHash });
    }

    return NextResponse.json(
      { error: "Cannot cancel this job. Either you are not the poster, the job is not Open, or the deadline has not passed for an Accepted job." },
      { status: 400 }
    );
  } catch (error) {
    console.error("POST /api/jobs/[id]/cancel error:", error);
    return NextResponse.json(
      { error: "Failed to cancel job" },
      { status: 500 }
    );
  }
}
