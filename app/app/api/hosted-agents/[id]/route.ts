import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkUrlSync } from "@/lib/ssrf";
import { requireAuth, requireWalletMatch } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const agent = await prisma.hostedAgent.findUnique({ where: { id } });
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(agent);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const raw = await req.text();
  const auth = await requireAuth(req, { rawBody: raw });
  if (!auth.ok)
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const body = raw ? JSON.parse(raw) : {};
  const { walletAddress, ...updates } = body;

  const guard = requireWalletMatch(auth, walletAddress);
  if (!guard.ok)
    return NextResponse.json({ error: guard.reason }, { status: guard.status });

  const agent = await prisma.hostedAgent.findUnique({ where: { id } });
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (agent.walletAddress !== walletAddress) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Only allow specific fields
  const allowed: Record<string, any> = {};
  if (updates.name !== undefined) allowed.name = updates.name;
  if (updates.systemPrompt !== undefined) allowed.systemPrompt = updates.systemPrompt;
  if (updates.model !== undefined) allowed.model = updates.model;
  if (updates.category !== undefined) allowed.category = updates.category;
  if (updates.minPrice !== undefined) allowed.minPrice = Number(updates.minPrice);
  if (updates.maxPrice !== undefined) allowed.maxPrice = Number(updates.maxPrice);
  if (updates.webEnabled !== undefined) allowed.webEnabled = Boolean(updates.webEnabled);
  if (updates.pricePerPrompt !== undefined) allowed.pricePerPrompt = Number(updates.pricePerPrompt);
  if (updates.active !== undefined) allowed.active = Boolean(updates.active);
  if (updates.avatarUrl !== undefined) {
    if (updates.avatarUrl) {
      const guard = checkUrlSync(String(updates.avatarUrl));
      if (!guard.ok) {
        return NextResponse.json({ error: `Invalid avatarUrl: ${guard.reason}` }, { status: 400 });
      }
    }
    allowed.avatarUrl = updates.avatarUrl;
  }

  const updated = await prisma.hostedAgent.update({ where: { id }, data: allowed });
  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const raw = await req.text();
  const auth = await requireAuth(req, { rawBody: raw });
  if (!auth.ok)
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  let body: { walletAddress?: string } = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }
  const { walletAddress } = body;

  const agent = await prisma.hostedAgent.findUnique({ where: { id } });
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!walletAddress) {
    return NextResponse.json({ error: "walletAddress required" }, { status: 400 });
  }
  const guard = requireWalletMatch(auth, walletAddress);
  if (!guard.ok)
    return NextResponse.json({ error: guard.reason }, { status: guard.status });
  if (agent.walletAddress !== walletAddress) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  await prisma.hostedAgent.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
