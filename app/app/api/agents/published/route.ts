import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const agents = await prisma.publishedAgent.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ agents });
  } catch (err) {
    console.error("Fetch published agents error:", err);
    return NextResponse.json({ agents: [] });
  }
}
