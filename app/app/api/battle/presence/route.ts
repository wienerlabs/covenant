import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/battle/presence — heartbeat from a spectator
 * Body: { sessionId }
 */
export async function POST(req: NextRequest) {
  try {
    const { sessionId } = (await req.json()) as { sessionId?: string };
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }

    await prisma.battlePresence.upsert({
      where: { sessionId },
      create: { sessionId, lastSeen: new Date() },
      update: { lastSeen: new Date() },
    });

    // Count active viewers (seen in last 60s)
    const cutoff = new Date(Date.now() - 60_000);
    const count = await prisma.battlePresence.count({
      where: { lastSeen: { gte: cutoff } },
    });

    return NextResponse.json({ count });
  } catch (error) {
    console.error("POST /api/battle/presence error:", error);
    return NextResponse.json({ count: 1 });
  }
}

/**
 * GET /api/battle/presence — get current viewer count
 */
export async function GET() {
  const cutoff = new Date(Date.now() - 60_000);
  const count = await prisma.battlePresence.count({
    where: { lastSeen: { gte: cutoff } },
  });
  return NextResponse.json({ count });
}
