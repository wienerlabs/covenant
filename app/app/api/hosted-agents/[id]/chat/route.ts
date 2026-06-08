import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { webSearch } from "@/lib/web-search";
import { getSolanaContext } from "@/lib/solana-agent";
import { rateLimitDurable } from "@/lib/rateLimit";
import {
  buildPaymentRequired,
  verifyPayment,
  encodePaymentRequiredHeader,
} from "@/lib/x402-server";
import {
  hashPaymentRequest,
  claimPayment,
  finalizePayment,
  releasePayment,
} from "@/lib/x402-payments";

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
  const { allowed, resetAt } = await rateLimitDurable(`chat:${ip}`, 30);
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
  // True once we hold a fresh (first-use) payment that this request must
  // finalize on success or release on failure (C-036).
  let paymentClaimed = false;
  // Verified payment facts captured for revenue reconciliation (C-037).
  let paidAmountUsdc = 0;
  let paidPayer = "";

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

    // Payment signature provided — verify it on chain (amount, mint,
    // recipient, confirmed). No bypass tokens (C-030/C-031/C-033/C-034).
    const verification = await verifyPayment(paymentSig, paymentRequired);

    if (!verification.valid) {
      // Payment verification failed — return 402 again with the reason.
      const encodedHeader = encodePaymentRequiredHeader(paymentRequired);
      return new Response(
        JSON.stringify({
          ...paymentRequired,
          error: `Payment verification failed: ${verification.reason ?? "invalid payment"}.`,
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

    paymentTxHash = verification.txHash;

    // C-032 / C-036: a verified payment is spent exactly once. An
    // idempotent retry of the same prompt replays the cached response;
    // the same payment for a different prompt is rejected as consumed.
    const claim = await claimPayment({
      txSignature: verification.txHash,
      agentId: id,
      payer: verification.payer,
      amountAtomic: verification.amountAtomic ?? "0",
      requestHash: hashPaymentRequest(id, message),
    });

    if (claim.kind === "replay") {
      return new NextResponse(claim.body, {
        status: claim.code,
        headers: {
          "Content-Type": "application/json",
          "x-idempotent-replay": "true",
        },
      });
    }
    if (claim.kind === "consumed") {
      return NextResponse.json(
        {
          error:
            "This payment has already been used for a different prompt. Each payment is valid for one message.",
        },
        { status: 409 },
      );
    }
    if (claim.kind === "pending") {
      return NextResponse.json(
        { error: "This payment is still being processed. Please retry in a moment." },
        { status: 409 },
      );
    }

    // claim.kind === "fresh" — we own this payment for this request.
    paymentClaimed = true;
    paidAmountUsdc = Number(verification.amountAtomic ?? "0") / 1_000_000;
    paidPayer = verification.payer;
  }

  /**
   * Serve a paid response and finalize the payment so an idempotent
   * retry replays it byte-for-byte (C-036). On the free path this is a
   * plain JSON response.
   */
  const servePaid = async (
    payload: Record<string, unknown>,
  ): Promise<NextResponse> => {
    const res = NextResponse.json(payload);
    if (paymentClaimed) {
      await finalizePayment(paymentTxHash, JSON.stringify(payload), 200);
      // C-037: one revenue row per verified payment, at the amount actually
      // paid on chain, so the revenue total reconciles to verified payments.
      try {
        await prisma.$transaction([
          prisma.agentRevenue.create({
            data: {
              agentId: id,
              userWallet: walletAddress || paidPayer || "anonymous",
              amount: paidAmountUsdc,
              paymentTx: paymentTxHash,
            },
          }),
          prisma.hostedAgent.update({
            where: { id },
            data: { totalRevenue: { increment: paidAmountUsdc } },
          }),
        ]);
      } catch {
        /* best effort — reconcileAgentRevenue surfaces any drift */
      }
    }
    return res;
  };

  /* ---------------------------------------------------------------- */
  /*  Design agent fast path                                           */
  /*                                                                  */
  /*  Design-category agents do NOT call the LLM. Their job is to     */
  /*  produce an image, so we route directly to fal.ai and return the */
  /*  generated URL embedded as a markdown image. The agent's system  */
  /*  prompt acts as a persistent style modifier on top of the user's */
  /*  current message, so a "minimalist logo agent" stays minimalist  */
  /*  across every request without the user repeating it.             */
  /* ---------------------------------------------------------------- */

  if (agent.category === "design") {
    const userWallet = walletAddress || "anonymous";

    // Persist the user message so chat history is consistent with the
    // text-agent path.
    await prisma.chatMessage.create({
      data: { agentId: id, userWallet, role: "user", content: message },
    });

    // Compose the image prompt from the user request + the agent's
    // system prompt as a short style modifier. Keep both bounded to
    // avoid blowing past fal.ai's prompt window.
    const styleSuffix = agent.systemPrompt
      ? `, style: ${agent.systemPrompt.replace(/\s+/g, " ").slice(0, 240)}`
      : "";
    const imgPrompt = `${message.slice(0, 600)}${styleSuffix}`;

    let imageUrl: string | null = null;
    let imgErr: string | null = null;
    try {
      const imgRes = await fetch(
        new URL("/api/generate/image", req.url).toString(),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt: imgPrompt, size: "square" }),
        },
      );
      if (imgRes.ok) {
        const imgData = (await imgRes.json()) as { imageUrl?: string };
        imageUrl = imgData.imageUrl ?? null;
      } else {
        const text = await imgRes.text().catch(() => "");
        imgErr = `fal.ai responded ${imgRes.status}: ${text.slice(0, 200)}`;
      }
    } catch (err) {
      imgErr = err instanceof Error ? err.message : String(err);
    }

    const response = imageUrl
      ? `![${message.slice(0, 80)}](${imageUrl})\n\n*Prompt: ${message}*`
      : `Image generation failed. ${imgErr ?? "Please retry."}`;

    await prisma.chatMessage.create({
      data: { agentId: id, userWallet, role: "agent", content: response },
    });

    return servePaid({
      response,
      imageUrl,
      mode: "image",
      agentId: id,
      priceCharged: agent.pricePerPrompt,
      paymentTx: paymentTxHash || undefined,
    });
  }

  /* ---------------------------------------------------------------- */
  /*  Enrich context (text agents only)                                */
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
    const { withCreditFallback } = await import("@/lib/anthropic-safe");
    const client = withCreditFallback(new Anthropic());

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

    return servePaid({
      response,
      wordCount: response.split(/\s+/).length,
      agentId: id,
      priceCharged: agent.pricePerPrompt,
      paymentTx: paymentTxHash || undefined,
    });
  } catch (err) {
    console.error("[hosted-agents/chat] AI call error:", err);
    // The payer was charged on chain but we produced nothing — release
    // the payment so they can retry the same payment (C-036, one charge).
    if (paymentClaimed) await releasePayment(paymentTxHash);
    return NextResponse.json(
      { error: "Failed to generate response" },
      { status: 500 }
    );
  }
}
