import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const verification = await prisma.verification.findUnique({
      where: { id },
    });

    if (!verification) {
      return NextResponse.json(
        { error: "Certificate not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: verification.id,
      textHash: verification.textHash,
      wordCount: verification.wordCount,
      minWords: verification.minWords,
      verified: verification.verified,
      cycleCount: verification.cycleCount,
      sharedBy: verification.sharedBy,
      createdAt: verification.createdAt.toISOString(),
    });
  } catch (err) {
    console.error("Certificate fetch error:", err);
    return NextResponse.json(
      { error: "Failed to fetch certificate" },
      { status: 500 }
    );
  }
}
