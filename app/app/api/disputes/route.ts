import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/disputes — list all disputes, optionally filtered by jobId or status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");
    const status = searchParams.get("status");

    const where: Record<string, string> = {};
    if (jobId) where.jobId = jobId;
    if (status) where.status = status;

    const disputes = await prisma.dispute.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json(disputes);
  } catch (error) {
    console.error("GET /api/disputes error:", error);
    return NextResponse.json(
      { error: "Failed to fetch disputes" },
      { status: 500 }
    );
  }
}

// POST /api/disputes — create a new dispute
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, raisedBy, reason } = body;

    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json(
        { error: "jobId is required" },
        { status: 400 }
      );
    }
    if (!raisedBy || typeof raisedBy !== "string") {
      return NextResponse.json(
        { error: "raisedBy (wallet address) is required" },
        { status: 400 }
      );
    }
    if (!reason || typeof reason !== "string" || reason.trim().length < 10) {
      return NextResponse.json(
        { error: "reason is required (min 10 characters)" },
        { status: 400 }
      );
    }

    // Validate job exists and is in a disputable state
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (!["Completed", "Accepted"].includes(job.status)) {
      return NextResponse.json(
        { error: "Can only dispute jobs that are Completed or Accepted" },
        { status: 400 }
      );
    }

    // Check if there's already an open dispute for this job
    const existingDispute = await prisma.dispute.findFirst({
      where: { jobId, status: "open" },
    });
    if (existingDispute) {
      return NextResponse.json(
        { error: "There is already an open dispute for this job" },
        { status: 409 }
      );
    }

    // Create the dispute and update job status
    const [dispute] = await prisma.$transaction(async (tx) => {
      const d = await tx.dispute.create({
        data: {
          jobId,
          raisedBy,
          reason: reason.trim(),
        },
      });

      await tx.job.update({
        where: { id: jobId },
        data: { status: "Disputed" },
      });

      return [d];
    });

    return NextResponse.json(dispute, { status: 201 });
  } catch (error) {
    console.error("POST /api/disputes error:", error);
    return NextResponse.json(
      { error: "Failed to create dispute" },
      { status: 500 }
    );
  }
}
