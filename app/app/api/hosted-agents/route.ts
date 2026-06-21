import { NextRequest, NextResponse } from "next/server";
import { blockSimulatedRouteIfOnchain } from "@/lib/settlement";
import { prisma } from "@/lib/prisma";
import { awardXP } from "@/lib/xp";
import { sendMarkerTransaction } from "@/lib/solana";
import { checkUrlSync } from "@/lib/ssrf";
import { requireAuth, requireWalletMatch } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/hosted-agents
 *
 * List all active hosted agents, ordered by most recent first.
 */
export async function GET(req: NextRequest) {
  try {
    const wallet = req.nextUrl.searchParams.get("wallet");
    const showAll = req.nextUrl.searchParams.get("all") === "true";

    // If wallet + all: return ALL agents for this wallet (including inactive) — for dashboard
    // Otherwise: return only active agents (marketplace)
    const where = wallet && showAll
      ? { walletAddress: wallet }
      : { active: true };

    const agents = await prisma.hostedAgent.findMany({
      where,
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
 * Body: { walletAddress, name, category, systemPrompt, model, minPrice, maxPrice, webEnabled? }
 */
export async function POST(req: NextRequest) {
  const blocked = blockSimulatedRouteIfOnchain("POST /api/hosted-agents");
  if (blocked) return blocked;

  try {
    const raw = await req.text();
    const auth = await requireAuth(req, { rawBody: raw });
    if (!auth.ok)
      return NextResponse.json({ error: auth.reason }, { status: auth.status });
    const body = raw ? JSON.parse(raw) : {};
    const { walletAddress, name, category, systemPrompt, model, minPrice, maxPrice, avatarUrl, webEnabled } = body as {
      walletAddress?: string;
      name?: string;
      category?: string;
      systemPrompt?: string;
      model?: string;
      minPrice?: number;
      maxPrice?: number;
      avatarUrl?: string;
      webEnabled?: boolean;
    };

    // ---- Validation ----
    if (!walletAddress || typeof walletAddress !== "string") {
      return NextResponse.json({ error: "walletAddress is required" }, { status: 400 });
    }

    // IDOR bind: only the wallet owner may create agents under their address.
    const guard = requireWalletMatch(auth, walletAddress);
    if (!guard.ok)
      return NextResponse.json({ error: guard.reason }, { status: guard.status });
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
    // avatarUrl is optional; when present it must be a public http(s) URL
    // (blocks javascript:/data: and private/internal targets).
    if (avatarUrl) {
      const guard = checkUrlSync(String(avatarUrl));
      if (!guard.ok) {
        return NextResponse.json({ error: `Invalid avatarUrl: ${guard.reason}` }, { status: 400 });
      }
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
        avatarUrl: avatarUrl || null,
        webEnabled: webEnabled === true,
        active: true,
      },
    });

    // ---- Award 50 XP for creating an agent ----
    try {
      await awardXP(walletAddress, 50, "agent_create");
    } catch (xpErr) {
      console.error("[hosted-agents] XP award error (non-fatal):", xpErr);
    }

    // ---- Generate DID ----
    const did = `did:covenant:agent:${agent.id}`;

    // ---- On-chain metadata memo (non-fatal) ----
    try {
      const memo = `CVNT:AGENT:${agent.id}:${did}`;
      const txSig = await sendMarkerTransaction(memo);

      await prisma.hostedAgent.update({
        where: { id: agent.id },
        data: { onChainTx: txSig },
      });
    } catch (err) {
      console.error("[hosted-agents] on-chain metadata failed:", err);
      // Non-fatal — agent still created
    }

    return NextResponse.json({ ...agent, did }, { status: 201 });
  } catch (err) {
    console.error("[hosted-agents] POST error:", err);
    return NextResponse.json({ error: "Failed to create hosted agent" }, { status: 500 });
  }
}
