import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [jobs, profiles, reputations, submissions] = await Promise.all([
      prisma.job.findMany({
        orderBy: { createdAt: "desc" },
      }),
      prisma.profile.findMany({
        orderBy: { createdAt: "desc" },
      }),
      prisma.reputation.findMany({
        orderBy: { updatedAt: "desc" },
      }),
      prisma.submission.findMany({
        orderBy: { submittedAt: "desc" },
      }),
    ]);

    return NextResponse.json({ jobs, profiles, reputations, submissions });
  } catch (error) {
    console.error("GET /api/admin error:", error);
    return NextResponse.json(
      { error: "Failed to fetch admin data" },
      { status: 500 }
    );
  }
}
