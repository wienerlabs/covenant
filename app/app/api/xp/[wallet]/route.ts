import { NextRequest, NextResponse } from "next/server";
import { getXP } from "@/lib/xp";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ wallet: string }> },
) {
  const { wallet } = await params;
  const xp = await getXP(wallet);
  return NextResponse.json(xp);
}
