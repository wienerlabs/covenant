import { prisma } from "@/lib/prisma";
import { AGENT_ALPHA, AGENT_OMEGA } from "@/lib/agents";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Count all battle jobs (those with battleMode in specJson)
    const allBattleJobs = await prisma.job.findMany({
      where: {
        status: "Completed",
        specJson: {
          path: ["battleMode"],
          equals: true,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        specJson: true,
        takerWallet: true,
        amount: true,
        createdAt: true,
      },
    });

    const totalBattles = allBattleJobs.length;
    const alphaWins = allBattleJobs.filter((j) => j.takerWallet === AGENT_ALPHA.wallet).length;
    const omegaWins = allBattleJobs.filter((j) => j.takerWallet === AGENT_OMEGA.wallet).length;
    const totalStaked = allBattleJobs.reduce((sum, j) => sum + (j.amount || 0), 0);

    // Build history from last 5
    const history = allBattleJobs.slice(0, 5).map((j) => {
      const spec = j.specJson as Record<string, unknown>;
      return {
        id: j.id,
        title: String(spec?.title || "Battle"),
        winner: j.takerWallet === AGENT_ALPHA.wallet ? "alpha" : "omega",
        alphaScore: 0, // We don't store individual scores in this model
        omegaScore: 0,
        amount: j.amount,
        date: j.createdAt.toISOString(),
      };
    });

    return NextResponse.json({
      stats: {
        totalBattles,
        alphaWins,
        omegaWins,
        totalStaked: Math.round(totalStaked),
      },
      history,
    });
  } catch (err) {
    console.error("[battle/stats] Error:", err);
    return NextResponse.json({
      stats: { totalBattles: 0, alphaWins: 0, omegaWins: 0, totalStaked: 0 },
      history: [],
    });
  }
}
