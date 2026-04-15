import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.CRON_SECRET;
  if (ADMIN_SECRET) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${ADMIN_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

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
