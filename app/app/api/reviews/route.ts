import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireWalletMatch } from "@/lib/require-auth";

/**
 * POST /api/reviews — submit a rating for a finalized/resolved job
 * GET  /api/reviews?taker=<wallet> — list reviews for a taker
 */

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    const auth = await requireAuth(req, { rawBody: raw });
    if (!auth.ok)
      return NextResponse.json({ error: auth.reason }, { status: auth.status });
    const body = raw ? JSON.parse(raw) : {};
    const { jobId, posterWallet, takerWallet, rating, comment } = body as {
      jobId?: string;
      posterWallet?: string;
      takerWallet?: string;
      rating?: number;
      comment?: string;
    };

    if (!jobId || !posterWallet || !takerWallet) {
      return NextResponse.json(
        { error: "jobId, posterWallet, and takerWallet are required" },
        { status: 400 },
      );
    }

    // Bind to the signer: only the poster may write the review (the
    // job.posterWallet check below is otherwise spoofable once enforced).
    const guard = requireWalletMatch(auth, posterWallet);
    if (!guard.ok)
      return NextResponse.json({ error: guard.reason }, { status: guard.status });
    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "rating must be 1-5" },
        { status: 400 },
      );
    }

    // Verify job exists and is finalized/resolved
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (!["Finalized", "Resolved", "Completed"].includes(job.status)) {
      return NextResponse.json(
        { error: "Can only review finalized or resolved jobs" },
        { status: 400 },
      );
    }
    if (job.posterWallet !== posterWallet) {
      return NextResponse.json(
        { error: "Only the poster can review" },
        { status: 403 },
      );
    }

    // Check for existing review
    const existing = await prisma.review.findUnique({ where: { jobId } });
    if (existing) {
      return NextResponse.json(
        { error: "This job has already been reviewed" },
        { status: 409 },
      );
    }

    // Create review + update reputation avg
    const review = await prisma.$transaction(async (tx) => {
      const r = await tx.review.create({
        data: {
          jobId,
          posterWallet,
          takerWallet,
          rating: Math.round(rating),
          comment: comment?.trim() || null,
        },
      });

      // Recompute average rating for the taker
      const allReviews = await tx.review.findMany({
        where: { takerWallet },
        select: { rating: true },
      });
      const avg =
        allReviews.reduce((sum, rv) => sum + rv.rating, 0) / allReviews.length;

      await tx.reputation.upsert({
        where: { walletAddress: takerWallet },
        create: {
          walletAddress: takerWallet,
          avgRating: avg,
          reviewCount: allReviews.length,
        },
        update: {
          avgRating: avg,
          reviewCount: allReviews.length,
        },
      });

      return r;
    });

    return NextResponse.json(review, { status: 201 });
  } catch (error) {
    console.error("POST /api/reviews error:", error);
    return NextResponse.json(
      { error: "Failed to submit review" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const taker = searchParams.get("taker");

  if (!taker) {
    return NextResponse.json(
      { error: "taker query param required" },
      { status: 400 },
    );
  }

  const reviews = await prisma.review.findMany({
    where: { takerWallet: taker },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(reviews);
}
