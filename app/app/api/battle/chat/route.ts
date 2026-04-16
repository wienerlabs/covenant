import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const messages = await prisma.battleChat.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(messages.reverse());
}

export async function POST(req: NextRequest) {
  const { sessionId, wallet, message } = await req.json();
  if (!message || !sessionId)
    return NextResponse.json(
      { error: "message and sessionId required" },
      { status: 400 },
    );
  if (message.length > 200)
    return NextResponse.json({ error: "Max 200 chars" }, { status: 400 });

  const chat = await prisma.battleChat.create({
    data: {
      sessionId,
      wallet: wallet || null,
      message: message.slice(0, 200),
    },
  });
  return NextResponse.json(chat);
}
