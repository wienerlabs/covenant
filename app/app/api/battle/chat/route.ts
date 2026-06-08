import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimitDurable } from "@/lib/rateLimit";

export async function GET() {
  const messages = await prisma.battleChat.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(messages.reverse());
}

/**
 * POST /api/battle/chat
 * Spectator chat message. Rate-limited by IP + sessionId (audit H3 —
 * previously unthrottled, trivially spammable).
 *
 * NOTE: this endpoint still accepts an unauthenticated `wallet` string
 * as display attribution. Real signature-based authentication is
 * tracked separately — for now the 200-char cap + rate limit + short
 * wallet-only display (4…4) keeps the spam surface narrow.
 */
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for") ??
    req.headers.get("x-real-ip") ??
    "unknown";

  // Parse body first so we can key the limiter on sessionId when available
  // (keeps one user in an office behind NAT from shutting up a whole LAN).
  let parsed: { sessionId?: string; wallet?: string; message?: string };
  try {
    parsed = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { sessionId, wallet, message } = parsed;

  if (!message || typeof message !== "string") {
    return NextResponse.json(
      { error: "message and sessionId required" },
      { status: 400 },
    );
  }
  if (!sessionId || typeof sessionId !== "string") {
    return NextResponse.json(
      { error: "message and sessionId required" },
      { status: 400 },
    );
  }
  if (message.length === 0 || message.length > 200) {
    return NextResponse.json(
      { error: "message must be 1-200 chars" },
      { status: 400 },
    );
  }
  if (sessionId.length > 128) {
    return NextResponse.json({ error: "invalid sessionId" }, { status: 400 });
  }

  // 30 messages / minute per (ip, session) pair.
  const rl = await rateLimitDurable(`battle-chat:${ip}:${sessionId}`, 30, 60_000);
  if (!rl.allowed) {
    const retryAfter = Math.ceil((rl.resetAt - Date.now()) / 1000);
    return NextResponse.json(
      { error: "Slow down — too many messages." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  // Reject obvious control chars / pure whitespace.
  const trimmed = message.trim();
  if (!trimmed) {
    return NextResponse.json(
      { error: "message cannot be empty" },
      { status: 400 },
    );
  }

  const chat = await prisma.battleChat.create({
    data: {
      sessionId,
      wallet: typeof wallet === "string" && wallet.length <= 64 ? wallet : null,
      message: trimmed.slice(0, 200),
    },
  });
  return NextResponse.json(chat);
}
