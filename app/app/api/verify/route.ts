import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executeCircuit } from "@/lib/sp1-circuit";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, minWords } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const min = typeof minWords === "number" && minWords > 0 ? minWords : 100;

    // Execute the SP1 circuit
    const result = executeCircuit(text, min);

    // Store verification in DB
    const verification = await prisma.verification.create({
      data: {
        textHash: result.textHash,
        wordCount: result.wordCount,
        minWords: min,
        verified: result.verified,
        cycleCount: result.cycleCount,
        sharedBy: body.walletAddress || null,
      },
    });

    return NextResponse.json({
      certificateId: verification.id,
      verified: result.verified,
      wordCount: result.wordCount,
      minWords: min,
      textHash: result.textHash,
      cycleCount: result.cycleCount,
      executionTime: result.executionTime,
    });
  } catch (err) {
    console.error("Verify error:", err);
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 500 }
    );
  }
}
