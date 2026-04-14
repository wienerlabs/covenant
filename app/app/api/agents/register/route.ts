import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { awardXP } from "@/lib/xp";
import { unlockAchievement } from "@/lib/achievements";

const VALID_CAPABILITIES = [
  "writing",
  "code_review",
  "translation",
  "data_labeling",
  "bug_bounty",
  "design",
] as const;

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

// ── POST: Register a new agent ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress, name, description, endpointUrl, capabilities } = body;

    // ── Field presence ────────────────────────────────────────────────────
    if (!walletAddress || !name || !description || !endpointUrl || !capabilities) {
      return NextResponse.json(
        { error: "walletAddress, name, description, endpointUrl, and capabilities are required" },
        { status: 400 },
      );
    }

    // ── Name length ───────────────────────────────────────────────────────
    const trimmedName = String(name).trim();
    if (trimmedName.length < 3 || trimmedName.length > 50) {
      return NextResponse.json(
        { error: "Agent name must be between 3 and 50 characters" },
        { status: 400 },
      );
    }

    // ── Endpoint URL ──────────────────────────────────────────────────────
    if (!isValidUrl(endpointUrl)) {
      return NextResponse.json(
        { error: "endpointUrl must be a valid HTTP or HTTPS URL" },
        { status: 400 },
      );
    }

    // ── Capabilities ──────────────────────────────────────────────────────
    if (!Array.isArray(capabilities) || capabilities.length === 0) {
      return NextResponse.json(
        { error: "At least one capability is required" },
        { status: 400 },
      );
    }

    const invalidCaps = capabilities.filter(
      (c: string) => !VALID_CAPABILITIES.includes(c as (typeof VALID_CAPABILITIES)[number]),
    );
    if (invalidCaps.length > 0) {
      return NextResponse.json(
        { error: `Invalid capabilities: ${invalidCaps.join(", ")}. Valid: ${VALID_CAPABILITIES.join(", ")}` },
        { status: 400 },
      );
    }

    // ── Rate limit: max 5 agents per wallet ───────────────────────────────
    const agentCount = await prisma.publishedAgent.count({
      where: { walletAddress },
    });
    if (agentCount >= 5) {
      return NextResponse.json(
        { error: "Maximum of 5 agents per wallet. Remove an existing agent before registering a new one." },
        { status: 429 },
      );
    }

    // ── Test the endpoint ─────────────────────────────────────────────────
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const testRes = await fetch(endpointUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "Hello, please respond with 'OK' to confirm you are operational.",
          test: true,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!testRes.ok) {
        return NextResponse.json(
          {
            error: `Agent endpoint returned HTTP ${testRes.status}. The endpoint must respond with a 2xx status to a test POST request.`,
          },
          { status: 422 },
        );
      }
    } catch (fetchErr: unknown) {
      const message =
        fetchErr instanceof Error && fetchErr.name === "AbortError"
          ? "Agent endpoint did not respond within 10 seconds."
          : `Could not reach agent endpoint: ${fetchErr instanceof Error ? fetchErr.message : "unknown error"}`;

      return NextResponse.json({ error: message }, { status: 422 });
    }

    // ── Generate DID ──────────────────────────────────────────────────────
    const did = `did:covenant:agent:${walletAddress.slice(0, 8)}:${Date.now()}`;

    // ── Persist ───────────────────────────────────────────────────────────
    const agent = await prisma.publishedAgent.create({
      data: {
        walletAddress,
        name: trimmedName,
        description: String(description).trim(),
        endpointUrl,
        agentType: "Task",
        capabilities,
        did,
        verified: true, // passed the endpoint test
      },
    });

    // ── Gamification ──────────────────────────────────────────────────────
    await unlockAchievement(walletAddress, "agent_smith");
    await awardXP(walletAddress, 50, "agent_register");

    return NextResponse.json({
      id: agent.id,
      did: agent.did,
      name: agent.name,
      description: agent.description,
      endpointUrl: agent.endpointUrl,
      capabilities: agent.capabilities,
      walletAddress: agent.walletAddress,
      verified: agent.verified,
      createdAt: agent.createdAt,
    });
  } catch (err) {
    console.error("Agent register error:", err);
    return NextResponse.json(
      { error: "Failed to register agent" },
      { status: 500 },
    );
  }
}

// ── GET: List all published agents ──────────────────────────────────────────
export async function GET() {
  try {
    const agents = await prisma.publishedAgent.findMany({
      orderBy: { createdAt: "desc" },
    });

    // Count agents per wallet
    const walletCounts: Record<string, number> = {};
    for (const a of agents) {
      walletCounts[a.walletAddress] = (walletCounts[a.walletAddress] || 0) + 1;
    }

    return NextResponse.json({
      agents,
      walletCounts,
      total: agents.length,
    });
  } catch (err) {
    console.error("Fetch agents error:", err);
    return NextResponse.json({ agents: [], walletCounts: {}, total: 0 });
  }
}
