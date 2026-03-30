import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMarkerTransaction } from "@/lib/solana";
import crypto from "crypto";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { takerWallet, text, wordCount } = body;

    if (!takerWallet || typeof takerWallet !== "string") {
      return NextResponse.json(
        { error: "takerWallet is required" },
        { status: 400 }
      );
    }
    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "text is required" },
        { status: 400 }
      );
    }
    if (!wordCount || typeof wordCount !== "number") {
      return NextResponse.json(
        { error: "wordCount is required" },
        { status: 400 }
      );
    }

    const job = await prisma.job.findUnique({ where: { id } });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.status !== "Accepted") {
      return NextResponse.json(
        { error: "Job is not in Accepted status" },
        { status: 400 }
      );
    }

    if (job.takerWallet !== takerWallet) {
      return NextResponse.json(
        { error: "Only the assigned taker can submit work" },
        { status: 403 }
      );
    }

    if (wordCount < job.minWords) {
      return NextResponse.json(
        { error: `Word count must be at least ${job.minWords}` },
        { status: 400 }
      );
    }

    const textHash = crypto
      .createHash("sha256")
      .update(text)
      .digest("hex");

    const [submission, updatedJob] = await prisma.$transaction(async (tx) => {
      const sub = await tx.submission.create({
        data: {
          jobId: id,
          takerWallet,
          textHash,
          wordCount,
          verified: false,
        },
      });

      const updated = await tx.job.update({
        where: { id },
        data: { status: "Completed" },
      });

      await tx.reputation.upsert({
        where: { walletAddress: takerWallet },
        create: {
          walletAddress: takerWallet,
          jobsCompleted: 1,
          totalEarned: job.amount,
          firstJobAt: new Date(),
        },
        update: {
          jobsCompleted: { increment: 1 },
          totalEarned: { increment: job.amount },
          firstJobAt: undefined,
        },
      });

      // Set firstJobAt if it was null
      const rep = await tx.reputation.findUnique({
        where: { walletAddress: takerWallet },
      });
      if (rep && !rep.firstJobAt) {
        await tx.reputation.update({
          where: { walletAddress: takerWallet },
          data: { firstJobAt: new Date() },
        });
      }

      return [sub, updated];
    });

    // Send Solana marker transaction (non-blocking)
    let txHash: string | null = null;
    try {
      txHash = await sendMarkerTransaction("submit_completion:" + id);
      await Promise.all([
        prisma.submission.update({
          where: { id: submission.id },
          data: { txHash },
        }),
        prisma.transaction.create({
          data: {
            txHash,
            type: "submit_completion",
            jobId: id,
            wallet: takerWallet,
            amount: job.amount,
            status: "confirmed",
          },
        }),
      ]);
    } catch (err) {
      console.error("[solana] Failed to send marker tx for submit_completion:", err);
    }

    return NextResponse.json({ job: updatedJob, submission: { ...submission, txHash }, txHash });
  } catch (error) {
    console.error("POST /api/jobs/[id]/submit error:", error);
    return NextResponse.json(
      { error: "Failed to submit work" },
      { status: 500 }
    );
  }
}
