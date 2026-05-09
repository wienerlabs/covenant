import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { awardXP } from "@/lib/xp";
import { unlockAchievement } from "@/lib/achievements";

export const dynamic = "force-dynamic";

/**
 * POST /api/battle/predict
 * Record a spectator's prediction before battle starts.
 * Body: { battleId, walletAddress, prediction: "alpha"|"omega" }
 */
export async function POST(req: NextRequest) {
  try {
    const { battleId, walletAddress, prediction } = (await req.json()) as {
      battleId?: string;
      walletAddress?: string;
      prediction?: string;
    };

    if (!battleId || !walletAddress || !prediction) {
      return NextResponse.json({ error: "battleId, walletAddress, prediction required" }, { status: 400 });
    }
    if (prediction !== "alpha" && prediction !== "omega") {
      return NextResponse.json({ error: "prediction must be 'alpha' or 'omega'" }, { status: 400 });
    }

    const existing = await prisma.battlePrediction.findUnique({
      where: { battleId_walletAddress: { battleId, walletAddress } },
    });
    if (existing) {
      return NextResponse.json({ error: "Already predicted", prediction: existing.prediction }, { status: 409 });
    }

    const record = await prisma.battlePrediction.create({
      data: { battleId, walletAddress, prediction },
    });

    return NextResponse.json({ ok: true, prediction: record.prediction });
  } catch (error) {
    console.error("POST /api/battle/predict error:", error);
    return NextResponse.json({ error: "Failed to record prediction" }, { status: 500 });
  }
}

/**
 * GET /api/battle/predict?battleId=xxx
 * Returns prediction counts + results.
 */
export async function GET(req: NextRequest) {
  const battleId = req.nextUrl.searchParams.get("battleId");
  if (!battleId) {
    return NextResponse.json({ error: "battleId required" }, { status: 400 });
  }

  const predictions = await prisma.battlePrediction.findMany({
    where: { battleId },
  });

  const alphaCount = predictions.filter((p) => p.prediction === "alpha").length;
  const omegaCount = predictions.filter((p) => p.prediction === "omega").length;
  const total = alphaCount + omegaCount;

  return NextResponse.json({
    battleId,
    total,
    alphaCount,
    omegaCount,
    alphaPercent: total > 0 ? Math.round((alphaCount / total) * 100) : 50,
    omegaPercent: total > 0 ? Math.round((omegaCount / total) * 100) : 50,
    predictions: predictions.map((p) => ({
      wallet: p.walletAddress,
      prediction: p.prediction,
      correct: p.correct,
    })),
  });
}

/**
 * PATCH /api/battle/predict
 * Resolve predictions after battle ends. INTERNAL USE ONLY.
 *
 * Authentication is fail-CLOSED: CRON_SECRET must be configured AND the
 * request must present it via x-internal-secret or Authorization bearer.
 * The legacy "fail-open when env unset" behaviour was flagged in the
 * battle audit (H4) — users were able to force-resolve predictions in
 * their favour and mint XP.
 *
 * The canonical resolution path now lives inside /api/battle/run (SSE
 * stream) which resolves its own predictions using the same logic. This
 * PATCH endpoint remains for cron / manual backfills.
 *
 * Body: { battleId, winner: "alpha"|"omega" }
 */
export async function PATCH(req: NextRequest) {
  const INTERNAL_SECRET = process.env.CRON_SECRET || "";
  const auth =
    req.headers.get("x-internal-secret") ||
    req.headers.get("authorization")?.replace("Bearer ", "");
  if (!INTERNAL_SECRET || auth !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { battleId, winner } = (await req.json()) as {
      battleId?: string;
      winner?: string;
    };

    if (!battleId || !winner) {
      return NextResponse.json({ error: "battleId, winner required" }, { status: 400 });
    }
    if (winner !== "alpha" && winner !== "omega") {
      return NextResponse.json(
        { error: "winner must be 'alpha' or 'omega'" },
        { status: 400 },
      );
    }

    // Previously required a matching arenaBattle row. The frontend's
    // `battle-${Date.now()}` id never matched an arenaBattle id so this
    // check caused every PATCH to 404 (audit C2). Accept any battleId
    // that has predictions — the caller is already authenticated via
    // CRON_SECRET, so an arbitrary id isn't a privilege escalation.

    const predictions = await prisma.battlePrediction.findMany({
      where: { battleId, correct: null },
    });

    let correctCount = 0;
    let wrongCount = 0;

    for (const pred of predictions) {
      const isCorrect = pred.prediction === winner;
      const xp = isCorrect ? 15 : 3;

      await prisma.battlePrediction.update({
        where: { id: pred.id },
        data: { correct: isCorrect, xpAwarded: xp },
      });

      await awardXP(pred.walletAddress, xp, isCorrect ? "correct_prediction" : "wrong_prediction");

      if (isCorrect) {
        correctCount++;
        // Check for Oracle achievement (5 correct in a row)
        const recentPredictions = await prisma.battlePrediction.findMany({
          where: { walletAddress: pred.walletAddress, correct: { not: null } },
          orderBy: { createdAt: "desc" },
          take: 5,
        });
        if (recentPredictions.length >= 5 && recentPredictions.every((p) => p.correct === true)) {
          await unlockAchievement(pred.walletAddress, "oracle");
        }
      } else {
        wrongCount++;
      }
    }

    return NextResponse.json({ ok: true, resolved: predictions.length, correctCount, wrongCount });
  } catch (error) {
    console.error("PATCH /api/battle/predict error:", error);
    return NextResponse.json({ error: "Failed to resolve predictions" }, { status: 500 });
  }
}
