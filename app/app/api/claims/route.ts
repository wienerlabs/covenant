import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  fetchClaimListing,
  verifyTxInvokedCovenant,
  deriveJobPda,
  deriveClaimPda,
} from "@/lib/credit-server";
import { PublicKey } from "@solana/web3.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/claims
 *
 * Marketplace query. Returns active listings with joined job data so
 * the UI can render amount / category / reputation / time-left in one
 * round-trip. Default sort: highest APR first (buyers want best yield).
 *
 * Query params:
 *   status=Listed|Bought|Cancelled|Settled   (default: Listed)
 *   sellerWallet=<base58>                    filter
 *   buyerWallet=<base58>                     filter
 *   minAmount=<number>                       face value lower bound
 *   maxAmount=<number>                       face value upper bound
 *   sortBy=apr|listedAt|faceValue            default: apr
 *   limit=<1..100>                           default 50
 *   offset=<number>                          default 0
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? "Listed";
    const sellerWallet = searchParams.get("sellerWallet");
    const buyerWallet = searchParams.get("buyerWallet");
    const minAmount = searchParams.get("minAmount");
    const maxAmount = searchParams.get("maxAmount");
    const sortBy = searchParams.get("sortBy") ?? "apr";
    const limit = Math.max(
      1,
      Math.min(100, parseInt(searchParams.get("limit") ?? "50", 10)),
    );
    const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10));

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (sellerWallet) where.sellerWallet = sellerWallet;
    if (buyerWallet) where.buyerWallet = buyerWallet;
    if (minAmount) where.faceValue = { ...(where.faceValue as object), gte: parseFloat(minAmount) };
    if (maxAmount) where.faceValue = { ...(where.faceValue as object), lte: parseFloat(maxAmount) };

    // Prisma cannot sort by a computed field (APR), so we sort at the DB
    // layer by listedAt/faceValue and do the APR sort in-memory when
    // requested.
    const prismaSortBy = sortBy === "faceValue" ? "faceValue" : "listedAt";

    const [claims, total] = await Promise.all([
      prisma.claimListing.findMany({
        where,
        include: {
          job: {
            select: {
              id: true,
              posterWallet: true,
              takerWallet: true,
              amount: true,
              category: true,
              specJson: true,
              status: true,
              challengeEndAt: true,
              deliveredAt: true,
            },
          },
        },
        orderBy: { [prismaSortBy]: "desc" },
        skip: offset,
        take: limit,
      }),
      prisma.claimListing.count({ where }),
    ]);

    // Pull reputation for every seller in one query (N+1 avoidance).
    const sellerWallets = Array.from(new Set(claims.map((c) => c.sellerWallet)));
    const reputations = sellerWallets.length
      ? await prisma.reputation.findMany({
          where: { walletAddress: { in: sellerWallets } },
        })
      : [];
    const repByWallet = new Map(reputations.map((r) => [r.walletAddress, r]));

    const now = Date.now();
    const enriched = claims.map((c) => {
      const discountPct =
        c.faceValue > 0 ? ((c.faceValue - c.price) / c.faceValue) * 100 : 0;
      const challengeEndMs = c.job.challengeEndAt?.getTime() ?? null;
      const secondsToChallengeEnd =
        challengeEndMs && challengeEndMs > now
          ? Math.round((challengeEndMs - now) / 1000)
          : 0;
      // Annualized yield: (faceValue / price - 1) over the remaining
      // challenge window. Capped at 9999% to avoid silly UI numbers on
      // listings with sub-second windows left.
      const yearsRemaining =
        secondsToChallengeEnd > 0 ? secondsToChallengeEnd / (365 * 24 * 3600) : 1e-9;
      const aprRaw =
        c.price > 0 ? (c.faceValue / c.price - 1) / yearsRemaining : 0;
      const aprPct = Math.min(9999, Math.max(0, aprRaw * 100));

      // Seller reputation → risk grade. A+ for squeaky-clean + lots of
      // work, down through C for thin history, D for disputes. This is
      // a dumb but demo-friendly heuristic; real underwriting would
      // weight by time-since-first-job, recency, etc.
      const rep = repByWallet.get(c.sellerWallet);
      const jobsCompleted = rep?.jobsCompleted ?? 0;
      const jobsFailed = rep?.jobsFailed ?? 0;
      const jobsDisputed = rep?.jobsDisputed ?? 0;
      const totalEarned = rep?.totalEarned ?? 0;
      const total = jobsCompleted + jobsFailed;
      let riskGrade: "A+" | "A" | "B" | "C" | "D" = "C";
      if (jobsDisputed > 2 || jobsFailed > 5) riskGrade = "D";
      else if (total === 0) riskGrade = "C";
      else if (jobsCompleted >= 20 && jobsDisputed === 0 && jobsFailed <= 1)
        riskGrade = "A+";
      else if (jobsCompleted >= 5 && jobsFailed <= 2) riskGrade = "A";
      else if (jobsCompleted >= 1) riskGrade = "B";

      return {
        ...c,
        discountPct,
        aprPct,
        secondsToChallengeEnd,
        reputation: {
          jobsCompleted,
          jobsFailed,
          jobsDisputed,
          totalEarned,
          riskGrade,
        },
      };
    });

    if (sortBy === "apr") {
      enriched.sort((a, b) => b.aprPct - a.aprPct);
    }

    // Lightweight TVL + counts for a header block on /credit.
    const [tvlRow] = await prisma.$queryRawUnsafe<{ tvl: number | null }[]>(
      `SELECT SUM("faceValue") as tvl FROM "ClaimListing" WHERE status = 'Listed'`,
    );
    const bought = await prisma.claimListing.count({ where: { status: "Bought" } });
    const settled = await prisma.claimListing.count({ where: { status: "Settled" } });

    return NextResponse.json({
      claims: enriched,
      total,
      limit,
      offset,
      stats: {
        activeTvl: Number(tvlRow?.tvl ?? 0),
        boughtCount: bought,
        settledCount: settled,
      },
    });
  } catch (error) {
    console.error("GET /api/claims error:", error);
    return NextResponse.json(
      { error: "Failed to fetch claims" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/claims
 *
 * Mirror a newly-created on-chain listing into the DB. Caller (seller)
 * has already invoked `list_claim` from their wallet and passes us the
 * resulting tx signature. We:
 *   1. Verify the tx landed + invoked our program (blocks audit C-04
 *      class of arbitrary-tx replay)
 *   2. Read the on-chain ClaimListing account and verify seller / price
 *      / face_value match the DB Job
 *   3. Upsert a ClaimListing row
 *
 * Body: { jobId, txSignature }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { jobId, txSignature } = body as {
      jobId?: string;
      txSignature?: string;
    };
    if (!jobId || !txSignature) {
      return NextResponse.json(
        { error: "jobId and txSignature are required" },
        { status: 400 },
      );
    }

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { claim: true },
    });
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    if (!job.takerWallet || !job.posterWallet) {
      return NextResponse.json(
        { error: "Job is missing required wallet fields" },
        { status: 400 },
      );
    }
    if (job.claim && job.claim.status === "Listed") {
      // Already mirrored — idempotent.
      return NextResponse.json(
        { claim: job.claim, note: "already-listed" },
        { status: 200 },
      );
    }

    await verifyTxInvokedCovenant(txSignature);

    const [jobPda] = deriveJobPda(
      new PublicKey(job.posterWallet),
      Buffer.from(job.specHash, "hex"),
    );
    const [claimPda] = deriveClaimPda(jobPda);

    const onchain = await fetchClaimListing(claimPda);
    if (!onchain) {
      return NextResponse.json(
        { error: "ClaimListing PDA not found on chain after tx confirmed" },
        { status: 400 },
      );
    }
    if (onchain.seller !== job.takerWallet) {
      return NextResponse.json(
        { error: "On-chain seller does not match job.takerWallet" },
        { status: 400 },
      );
    }
    if (Math.abs(onchain.faceValue - job.amount) > 1e-6) {
      return NextResponse.json(
        { error: "On-chain face_value does not match job.amount" },
        { status: 400 },
      );
    }
    if (onchain.status !== "Listed") {
      return NextResponse.json(
        { error: `On-chain status is ${onchain.status}, expected Listed` },
        { status: 400 },
      );
    }

    const claim = await prisma.claimListing.upsert({
      where: { pda: claimPda.toBase58() },
      create: {
        pda: claimPda.toBase58(),
        jobId: job.id,
        jobPda: jobPda.toBase58(),
        sellerWallet: onchain.seller,
        price: onchain.price,
        faceValue: onchain.faceValue,
        priceAtomic: onchain.priceAtomic.toString(),
        faceValueAtomic: onchain.faceValueAtomic.toString(),
        status: "Listed",
        listedAt: new Date(onchain.listedAt * 1000),
        listTxHash: txSignature,
      },
      update: {
        status: "Listed",
        price: onchain.price,
        priceAtomic: onchain.priceAtomic.toString(),
        listTxHash: txSignature,
      },
    });

    return NextResponse.json({ claim }, { status: 201 });
  } catch (error) {
    console.error("POST /api/claims error:", error);
    return NextResponse.json(
      {
        error: "Failed to mirror claim listing: " +
          (error instanceof Error ? error.message : String(error)),
      },
      { status: 500 },
    );
  }
}
