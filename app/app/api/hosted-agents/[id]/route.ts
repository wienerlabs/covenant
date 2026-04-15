import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
  const body = await req.json();
  const { walletAddress, ...updates } = body;

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

  const updated = await prisma.hostedAgent.update({ where: { id }, data: allowed });
  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { walletAddress } = body as { walletAddress?: string };

  const agent = await prisma.hostedAgent.findUnique({ where: { id } });
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (walletAddress && agent.walletAddress !== walletAddress) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  await prisma.hostedAgent.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
