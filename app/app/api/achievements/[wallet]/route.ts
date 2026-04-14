import { NextRequest, NextResponse } from "next/server";
import { getAchievementsForUser, checkAndUnlock } from "@/lib/achievements";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ wallet: string }> },
) {
  const { wallet } = await params;

  // Check and unlock any newly eligible achievements
  const newlyUnlocked = await checkAndUnlock(wallet);

  // Return full list with status
  const achievements = await getAchievementsForUser(wallet);

  return NextResponse.json({
    achievements,
    newlyUnlocked,
  });
}
