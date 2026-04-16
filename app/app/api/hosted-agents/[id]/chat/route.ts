import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { webSearch } from "@/lib/web-search";
import { getSolanaContext } from "@/lib/solana-agent";
import { rateLimit } from "@/lib/rateLimit";
import {
  buildPaymentRequired,
  verifyPayment,
  encodePaymentRequiredHeader,
} from "@/lib/x402-server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/* ------------------------------------------------------------------ */
/*  GET – return chat history for a user + agent pair                   */
/* ------------------------------------------------------------------ */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const wallet = req.nextUrl.searchParams.get("wallet") || "anonymous";

  const messages = await prisma.chatMessage.findMany({
    where: { agentId: id, userWallet: wallet },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  return NextResponse.json(messages);
}

/* ------------------------------------------------------------------ */
/*  POST – send a message and get AI response (x402 payment gated)     */
/* ------------------------------------------------------------------ */

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

  /* ---------------------------------------------------------------- */
  /*  x402 Payment Gate                                                */
  /* ---------------------------------------------------------------- */

  const paymentSig = req.headers.get("payment-signature");
  let paymentTxHash = "";

  if (agent.pricePerPrompt > 0) {
    const paymentRequired = buildPaymentRequired(
      id,
      agent.name,
      agent.pricePerPrompt,
      agent.walletAddress,
    );

    // No payment signature provided — return 402 with payment requirements
    if (!paymentSig) {
      const encodedHeader = encodePaymentRequiredHeader(paymentRequired);
      return new Response(JSON.stringify(paymentRequired), {
        status: 402,
        headers: {
          "Content-Type": "application/json",
          "Payment-Required": encodedHeader,
        },
      });
    }

    // Payment signature provided — verify it
    const { valid, txHash } = await verifyPayment(paymentSig, paymentRequired);

    if (!valid) {
      // Payment verification failed — return 402 again
      const encodedHeader = encodePaymentRequiredHeader(paymentRequired);
      return new Response(
        JSON.stringify({
          ...paymentRequired,
          error: "Payment verification failed. Please try again.",
        }),
        {
          status: 402,
          headers: {
            "Content-Type": "application/json",
            "Payment-Required": encodedHeader,
          },
        },
      );
    }

    paymentTxHash = txHash;
  }

  /* ---------------------------------------------------------------- */
  /*  Enrich context                                                   */
  /* ---------------------------------------------------------------- */

  // Enhance system prompt with capabilities info
  let systemPrompt = agent.systemPrompt;
  if (agent.webEnabled) {
    systemPrompt += "\n\n[System Note: You have web search access. Real-time search results are automatically provided with user messages when relevant. Use the search data provided to give accurate, up-to-date answers.]";
  }
  if (agent.category === "solana_agent") {
    systemPrompt += "\n\n[System Note: You have real-time Solana blockchain access. On-chain data (balances, transactions, account info) is automatically fetched and provided with user messages when a Solana address is detected.]";
  }

  let enrichedMessage = message;

  if (agent.webEnabled) {
    try {
      const search = await webSearch(message.slice(0, 100));
      if (search) enrichedMessage = `${search}\n\n---\nUser message: ${message}`;
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

  const userWallet = walletAddress || "anonymous";

  // Load conversation history (last 20 messages)
  const history = await prisma.chatMessage.findMany({
    where: { agentId: id, userWallet },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  // Save user message before calling AI
  await prisma.chatMessage.create({
    data: { agentId: id, userWallet, role: "user", content: message },
  });

  // Build conversation for AI (history + current enriched message)
  const conversationMessages: { role: "user" | "assistant"; content: string }[] =
    history.map((m) => ({
      role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
      content: m.content,
    }));
  conversationMessages.push({ role: "user", content: enrichedMessage });

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
      system: systemPrompt,
      messages: conversationMessages,
    });

    const textBlock = aiRes.content.find((b) => b.type === "text");
    const response =
      textBlock && "text" in textBlock ? textBlock.text : "No response generated.";

    // Save agent response to chat history
    await prisma.chatMessage.create({
      data: { agentId: id, userWallet, role: "agent", content: response },
    });

    // Record revenue (with real tx hash from x402 payment)
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
      paymentTx: paymentTxHash || undefined,
    });
  } catch (err) {
    console.error("[hosted-agents/chat] AI call error:", err);
    return NextResponse.json(
      { error: "Failed to generate response" },
      { status: 500 }
    );
  }
}
