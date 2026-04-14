import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateEloAfterBattle, getAgentElo } from "@/lib/elo";
import { awardXP, XP_REWARDS } from "@/lib/xp";

export const dynamic = "force-dynamic";

/**
 * POST /api/arena/battle
 *
 * Records a battle result, updates ELO ratings, and awards XP.
 *
 * Body: {
 *   challengeText, category,
 *   alphaAgent, omegaAgent,
 *   alphaOutput?, omegaOutput?,
 *   alphaScore, omegaScore,
 *   winnerAgent, judgeReason?,
 *   spectatorWallet?
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      challengeText,
      category,
      alphaAgent,
      omegaAgent,
      alphaOutput,
      omegaOutput,
      alphaScore,
      omegaScore,
      winnerAgent,
      judgeReason,
      spectatorWallet,
    } = body;

    if (!challengeText || !alphaAgent || !omegaAgent || !winnerAgent) {
      return NextResponse.json(
        { error: "Missing required fields: challengeText, alphaAgent, omegaAgent, winnerAgent" },
        { status: 400 },
      );
    }

    // 1. Create the ArenaBattle record
    const battle = await prisma.arenaBattle.create({
      data: {
        challengeText: String(challengeText),
        category: String(category || "text_writing"),
        alphaAgent: String(alphaAgent),
        omegaAgent: String(omegaAgent),
        alphaOutput: alphaOutput ? String(alphaOutput) : null,
        omegaOutput: omegaOutput ? String(omegaOutput) : null,
        alphaScore: Number(alphaScore) || 0,
        omegaScore: Number(omegaScore) || 0,
        winnerAgent: String(winnerAgent),
        judgeReason: judgeReason ? String(judgeReason) : null,
      },
    });

    // 2. Determine winner/loser wallets
    const isAlphaWinner = String(winnerAgent) === String(alphaAgent);
    const winnerWallet = isAlphaWinner ? String(alphaAgent) : String(omegaAgent);
    const loserWallet = isAlphaWinner ? String(omegaAgent) : String(alphaAgent);

    // 3. Update ELO ratings
    let eloResult;
    try {
      eloResult = await updateEloAfterBattle(winnerWallet, loserWallet, battle.id);
    } catch (eloErr) {
      console.error("[arena/battle] ELO update failed:", eloErr);
      eloResult = {
        winnerEloBefore: 1200,
        winnerEloAfter: 1200,
        winnerDelta: 0,
        loserEloBefore: 1200,
        loserEloAfter: 1200,
        loserDelta: 0,
      };
    }

    // 4. Award XP to spectator wallet (if provided)
    let spectatorXp = null;
    if (spectatorWallet) {
      try {
        spectatorXp = await awardXP(
          String(spectatorWallet),
          XP_REWARDS.arena_watch,
          "Watched an arena battle",
        );
      } catch (xpErr) {
        console.error("[arena/battle] Spectator XP award failed:", xpErr);
      }
    }

    // 5. Build response with ELO deltas
    const alphaEloDelta = isAlphaWinner ? eloResult.winnerDelta : eloResult.loserDelta;
    const omegaEloDelta = isAlphaWinner ? eloResult.loserDelta : eloResult.winnerDelta;
    const alphaEloAfter = isAlphaWinner ? eloResult.winnerEloAfter : eloResult.loserEloAfter;
    const omegaEloAfter = isAlphaWinner ? eloResult.loserEloAfter : eloResult.winnerEloAfter;

    return NextResponse.json({
      battleId: battle.id,
      alphaEloDelta,
      omegaEloDelta,
      alphaEloAfter,
      omegaEloAfter,
      spectatorXpAwarded: spectatorXp ? XP_REWARDS.arena_watch : 0,
      eloResult,
    });
  } catch (err) {
    console.error("[arena/battle] Error:", err);
    return NextResponse.json(
      { error: "Failed to record battle" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/arena/battle
 *
 * Returns recent arena battles with ELO data.
 * Query params: ?limit=10
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(50, Number(searchParams.get("limit")) || 10);

    const battles = await prisma.arenaBattle.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // Also fetch current agent ELO stats
    const alphaWallet =
      process.env.NEXT_PUBLIC_AGENT_ALPHA_WALLET ||
      "7GpXEwNrf8BVFBGMYjuYHoSmN1FvGFQD1MTtgJk2u7fG";
    const omegaWallet =
      process.env.NEXT_PUBLIC_AGENT_OMEGA_WALLET ||
      "55EbEM7x6WQxVFSt1KennwYBPgWF7GgF5bd2R2FVxiw1";

    let alphaElo, omegaElo;
    try {
      alphaElo = await getAgentElo(alphaWallet, "AGENT ALPHA");
      omegaElo = await getAgentElo(omegaWallet, "AGENT OMEGA");
    } catch {
      alphaElo = { elo: 1200, wins: 0, losses: 0, draws: 0, peakElo: 1200 };
      omegaElo = { elo: 1200, wins: 0, losses: 0, draws: 0, peakElo: 1200 };
    }

    return NextResponse.json({
      battles: battles.map((b) => ({
        id: b.id,
        challengeText: b.challengeText,
        category: b.category,
        alphaScore: b.alphaScore,
        omegaScore: b.omegaScore,
        winnerAgent: b.winnerAgent,
        alphaEloBefore: b.alphaEloBefore,
        omegaEloBefore: b.omegaEloBefore,
        alphaEloAfter: b.alphaEloAfter,
        omegaEloAfter: b.omegaEloAfter,
        createdAt: b.createdAt.toISOString(),
      })),
      alphaElo: {
        elo: alphaElo.elo,
        wins: alphaElo.wins,
        losses: alphaElo.losses,
        peakElo: alphaElo.peakElo,
      },
      omegaElo: {
        elo: omegaElo.elo,
        wins: omegaElo.wins,
        losses: omegaElo.losses,
        peakElo: omegaElo.peakElo,
      },
    });
  } catch (err) {
    console.error("[arena/battle] GET Error:", err);
    return NextResponse.json(
      {
        battles: [],
        alphaElo: { elo: 1200, wins: 0, losses: 0, peakElo: 1200 },
        omegaElo: { elo: 1200, wins: 0, losses: 0, peakElo: 1200 },
      },
    );
  }
}
