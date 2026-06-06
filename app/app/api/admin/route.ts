import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await guardAdmin(req, "admin.dump.read");
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
