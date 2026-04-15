import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { webSearch } from "@/lib/web-search";
import { getSolanaContext } from "@/lib/solana-agent";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Rate limit: 30 requests per minute per IP
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const { allowed, resetAt } = rateLimit(`chat:${ip}`, 30);
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later.", resetAt },
      { status: 429 }
    );
  }

  let body: { message?: string; walletAddress?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { message, walletAddress } = body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  const agent = await prisma.hostedAgent.findUnique({ where: { id } });
  if (!agent || !agent.active) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // Enrich context
  let enrichedMessage = message;

  if (agent.webEnabled) {
    try {
      const search = await webSearch(message.slice(0, 100));
      if (search) enrichedMessage = `${search}\n\n---\n${message}`;
    } catch {
      // non-fatal
    }
  }

  if (agent.category === "solana_agent") {
    try {
      const solana = await getSolanaContext(message);
      if (solana) enrichedMessage = `${solana}\n\n${enrichedMessage}`;
    } catch {
      // non-fatal
    }
  }

  // Call AI
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic();

    const modelMap: Record<string, string> = {
      "claude-haiku-4-5": "claude-haiku-4-5-20251001",
      "claude-sonnet-4-6": "claude-sonnet-4-6-20250514",
      "claude-opus-4-6": "claude-opus-4-6-20250514",
    };
    const modelId = modelMap[agent.model] || "claude-haiku-4-5-20251001";

    const aiRes = await client.messages.create({
      model: modelId,
      max_tokens: 2048,
      system: agent.systemPrompt,
      messages: [{ role: "user", content: enrichedMessage }],
    });

    const textBlock = aiRes.content.find((b) => b.type === "text");
    const response =
      textBlock && "text" in textBlock ? textBlock.text : "No response generated.";

    // Record revenue
    if (walletAddress && agent.pricePerPrompt > 0) {
      try {
        await prisma.$transaction([
          prisma.agentRevenue.create({
            data: {
              agentId: id,
              userWallet: walletAddress,
              amount: agent.pricePerPrompt,
            },
          }),
          prisma.hostedAgent.update({
            where: { id },
            data: { totalRevenue: { increment: agent.pricePerPrompt } },
          }),
        ]);
      } catch {
        /* best effort */
      }
    }

    return NextResponse.json({
      response,
      wordCount: response.split(/\s+/).length,
      agentId: id,
      priceCharged: agent.pricePerPrompt,
    });
  } catch (err) {
    console.error("[hosted-agents/chat] AI call error:", err);
    return NextResponse.json(
      { error: "Failed to generate response" },
      { status: 500 }
    );
  }
}
