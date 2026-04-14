import { NextResponse } from "next/server";
import { getEloLeaderboard } from "@/lib/elo";

export const dynamic = "force-dynamic";

export async function GET() {
  const leaderboard = await getEloLeaderboard(50);
  return NextResponse.json(leaderboard);
}
