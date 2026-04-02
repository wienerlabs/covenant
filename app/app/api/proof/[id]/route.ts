import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const job = await prisma.job.findUnique({
      where: { id },
      include: { submissions: true },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const submission = job.submissions?.[0] || null;

    // Get transaction hashes
    const transactions = await prisma.transaction.findMany({
      where: { jobId: id },
      orderBy: { createdAt: "desc" },
    });

    const txMap: Record<string, string> = {};
    for (const tx of transactions) {
      if (!txMap[tx.type]) txMap[tx.type] = tx.txHash;
    }

    return NextResponse.json({
      job: {
        id: job.id,
        status: job.status,
        amount: job.amount,
        paymentToken: job.paymentToken,
        category: job.category,
        minWords: job.minWords,
        posterWallet: job.posterWallet,
        takerWallet: job.takerWallet,
        specJson: job.specJson,
        createdAt: job.createdAt,
      },
      proof: submission
        ? {
            wordCount: submission.wordCount,
            textHash: submission.textHash,
            proofValid: submission.verified,
            submittedAt: submission.submittedAt,
          }
        : null,
      transactions: txMap,
    });
  } catch (error) {
    console.error("GET /api/proof/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch proof data" }, { status: 500 });
  }
}
