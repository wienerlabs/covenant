import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const wallet = searchParams.get("wallet");

    const where: Record<string, unknown> = {};
    if (wallet) {
      where.wallet = wallet;
    }

    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // If filtered by wallet, return flat array for dashboard
    // Otherwise, return wrapped format for backward compat with admin page
    if (wallet) {
      return NextResponse.json(transactions);
    }

    return NextResponse.json({ transactions });
  } catch (error) {
    console.error("GET /api/transactions error:", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}
