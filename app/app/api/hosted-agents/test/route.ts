import { NextRequest, NextResponse } from "next/server";
import { webSearch } from "@/lib/web-search";
import { getSolanaContext } from "@/lib/solana-agent";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// AVAILABLE_MODELS is defined in @/lib/models for shared use.

/** Map model id -> Anthropic API model string */
const ANTHROPIC_MODEL_MAP: Record<string, string> = {
  "claude-haiku-4-5": "claude-haiku-4-5-20251001",
  "claude-sonnet-4-6": "claude-sonnet-4-6-20250414",
  "claude-opus-4-6": "claude-opus-4-6-20250414",
};

/**
 * POST /api/hosted-agents/test
 *
 * Test an agent prompt in the playground.
 * Body: { systemPrompt, model, userPrompt, webEnabled? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { systemPrompt, model, userPrompt, webEnabled, category } = body as {
      systemPrompt?: string;
      model?: string;
      userPrompt?: string;
      webEnabled?: boolean;
      category?: string;
    };

    if (!systemPrompt || typeof systemPrompt !== "string") {
      return NextResponse.json({ error: "systemPrompt is required" }, { status: 400 });
    }
    if (!model || typeof model !== "string") {
      return NextResponse.json({ error: "model is required" }, { status: 400 });
    }
    if (!userPrompt || typeof userPrompt !== "string") {
      return NextResponse.json({ error: "userPrompt is required" }, { status: 400 });
    }

    const startTime = Date.now();

    // If web access is enabled, search and prepend results to user prompt
    let contextEnhanced = userPrompt;
    if (webEnabled) {
      const searchResults = await webSearch(userPrompt.slice(0, 100));
      if (searchResults) {
        contextEnhanced = `${searchResults}\n\n---\nUser Request: ${userPrompt}`;
      }
    }

    // If Solana agent or query contains a Solana address, fetch on-chain context
    if (category === "solana_agent" || /[1-9A-HJ-NP-Za-km-z]{32,44}/.test(userPrompt)) {
      const solanaContext = await getSolanaContext(userPrompt);
      if (solanaContext) {
        contextEnhanced = `${solanaContext}\n\n${contextEnhanced}`;
      }
    }

    // Determine which Anthropic model to use
    const isAnthropicNative = model.startsWith("claude-");
    const anthropicModelId = isAnthropicNative
      ? ANTHROPIC_MODEL_MAP[model] || "claude-haiku-4-5-20251001"
      : "claude-haiku-4-5-20251001"; // fallback for non-Anthropic models

    let responseText = "";
    let usedModel = model;
    let note: string | undefined;

    try {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic();

      const aiResponse = await client.messages.create({
        model: anthropicModelId,
        max_tokens: 1024,
        system: systemPrompt.trim(),
        messages: [{ role: "user", content: contextEnhanced.trim() }],
      });

      const textBlock = aiResponse.content.find(
        (b: { type: string }) => b.type === "text",
      );
      if (textBlock && "text" in textBlock) {
        responseText = (textBlock as { type: "text"; text: string }).text;
      } else {
        responseText = "No text response generated.";
      }

      if (!isAnthropicNative) {
        usedModel = "claude-haiku-4-5";
        note = `${model} coming soon — showing Claude Haiku preview`;
      }
    } catch (aiErr) {
      console.error("[hosted-agents/test] AI error:", aiErr);
      return NextResponse.json(
        { error: "Failed to generate response. Please try again." },
        { status: 500 },
      );
    }

    const responseTime = Date.now() - startTime;
    const wordCount = responseText
      .split(/\s+/)
      .filter((w) => w.length > 0).length;

    return NextResponse.json({
      response: responseText,
      model: usedModel,
      responseTime,
      wordCount,
      ...(note ? { note } : {}),
    });
  } catch (err) {
    console.error("[hosted-agents/test] POST error:", err);
    return NextResponse.json(
      { error: "Failed to test agent" },
      { status: 500 },
    );
  }
}
