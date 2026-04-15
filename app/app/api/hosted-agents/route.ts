import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { awardXP } from "@/lib/xp";

export const dynamic = "force-dynamic";

/**
 * GET /api/hosted-agents
 *
 * List all active hosted agents, ordered by most recent first.
 */
export async function GET() {
  try {
    const agents = await prisma.hostedAgent.findMany({
      where: { active: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(agents);
  } catch (err) {
    console.error("[hosted-agents] GET error:", err);
    return NextResponse.json([], { status: 500 });
  }
}

/**
 * POST /api/hosted-agents
 *
 * Create a new hosted agent from the no-code builder.
 * Body: { walletAddress, name, category, systemPrompt, model, minPrice, maxPrice }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress, name, category, systemPrompt, model, minPrice, maxPrice } = body as {
      walletAddress?: string;
      name?: string;
      category?: string;
      systemPrompt?: string;
      model?: string;
      minPrice?: number;
      maxPrice?: number;
    };

    // ---- Validation ----
    if (!walletAddress || typeof walletAddress !== "string") {
      return NextResponse.json({ error: "walletAddress is required" }, { status: 400 });
    }
    if (!name || typeof name !== "string" || name.trim().length < 3 || name.trim().length > 50) {
      return NextResponse.json({ error: "name must be 3-50 characters" }, { status: 400 });
    }
    if (!category || typeof category !== "string") {
      return NextResponse.json({ error: "category is required" }, { status: 400 });
    }
    if (!systemPrompt || typeof systemPrompt !== "string" || systemPrompt.trim().length < 20) {
      return NextResponse.json({ error: "systemPrompt must be at least 20 characters" }, { status: 400 });
    }
    if (!model || typeof model !== "string") {
      return NextResponse.json({ error: "model is required" }, { status: 400 });
    }
    if (typeof minPrice !== "number" || minPrice < 0) {
      return NextResponse.json({ error: "minPrice must be a non-negative number" }, { status: 400 });
    }
    if (typeof maxPrice !== "number" || maxPrice < minPrice) {
      return NextResponse.json({ error: "maxPrice must be >= minPrice" }, { status: 400 });
    }

    // ---- Create agent ----
    const avatarSeed = `hosted-${walletAddress.slice(0, 6)}-${Date.now()}`;

    const agent = await prisma.hostedAgent.create({
      data: {
        walletAddress,
        name: name.trim(),
        category,
        systemPrompt: systemPrompt.trim(),
        model,
        minPrice,
        maxPrice,
        avatarSeed,
        active: true,
      },
    });

    // ---- Award 50 XP for creating an agent ----
    try {
      await awardXP(walletAddress, 50, "agent_create");
    } catch (xpErr) {
      console.error("[hosted-agents] XP award error (non-fatal):", xpErr);
    }

    return NextResponse.json(agent, { status: 201 });
  } catch (err) {
    console.error("[hosted-agents] POST error:", err);
    return NextResponse.json({ error: "Failed to create hosted agent" }, { status: 500 });
  }
}
