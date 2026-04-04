import { NextResponse } from "next/server";
import { executeCircuit } from "@/lib/sp1-circuit";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { text, minWords } = body;

    if (typeof text !== "string" || typeof minWords !== "number") {
      return NextResponse.json(
        { error: "text (string) and minWords (number) are required" },
        { status: 400 }
      );
    }

    const result = executeCircuit(text, minWords);

    return NextResponse.json({
      passed: result.verified,
      wordCount: result.wordCount,
      textHash: result.textHash,
      cycleCount: result.cycleCount,
      executionTime: result.executionTime + "ms",
      hashMatch: result.hashMatch,
      wordCountPass: result.wordCountPass,
    });
  } catch (error) {
    console.error("POST /api/proof/execute error:", error);
    return NextResponse.json(
      { error: "Circuit execution failed" },
      { status: 500 }
    );
  }
}
