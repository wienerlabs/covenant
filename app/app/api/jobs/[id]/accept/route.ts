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
    const { takerWallet } = body;

    if (!takerWallet || typeof takerWallet !== "string") {
      return NextResponse.json(
        { error: "takerWallet is required" },
        { status: 400 }
      );
    }

    const job = await prisma.job.findUnique({ where: { id } });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.status !== "Open") {
      return NextResponse.json(
        { error: "Job is not open for acceptance" },
        { status: 400 }
      );
    }

    if (new Date() > job.deadline) {
      return NextResponse.json(
        { error: "Job deadline has passed" },
        { status: 400 }
      );
    }

    const updatedJob = await prisma.job.update({
      where: { id },
      data: {
        status: "Accepted",
        takerWallet,
      },
    });

    // Send Solana marker transaction (non-blocking)
    let txHash: string | null = null;
    try {
      txHash = await sendMarkerTransaction("accept_job:" + id);
      await prisma.transaction.create({
        data: {
          txHash,
          type: "accept_job",
          jobId: id,
          wallet: takerWallet,
          amount: job.amount,
          status: "confirmed",
        },
      });
    } catch (err) {
      console.error("[solana] Failed to send marker tx for accept_job:", err);
    }

    return NextResponse.json({ ...updatedJob, txHash });
  } catch (error) {
    console.error("POST /api/jobs/[id]/accept error:", error);
    return NextResponse.json(
      { error: "Failed to accept job" },
      { status: 500 }
    );
  }
}
