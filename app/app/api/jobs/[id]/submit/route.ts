import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMarkerTransaction } from "@/lib/solana";
import { releaseFundsToTaker } from "@/lib/escrow";
import { sendX402Payment, getAgentKeypair } from "@/lib/x402";
import { executeCircuit } from "@/lib/sp1-circuit";
import crypto from "crypto";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { takerWallet, text, wordCount, outputText: bodyOutputText } = body;

    if (!takerWallet || typeof takerWallet !== "string") {
      return NextResponse.json(
        { error: "takerWallet is required" },
        { status: 400 }
      );
    }
    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "text is required" },
        { status: 400 }
      );
    }
    if (!wordCount || typeof wordCount !== "number") {
      return NextResponse.json(
        { error: "wordCount is required" },
        { status: 400 }
      );
    }

    const job = await prisma.job.findUnique({ where: { id } });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.status !== "Accepted") {
      return NextResponse.json(
        { error: "Job is not in Accepted status" },
        { status: 400 }
      );
    }

    if (job.takerWallet !== takerWallet) {
      return NextResponse.json(
        { error: "Only the assigned taker can submit work" },
        { status: 403 }
      );
    }

    if (wordCount < job.minWords) {
      return NextResponse.json(
        { error: `Word count must be at least ${job.minWords}` },
        { status: 400 }
      );
    }

    // ===== ZK CIRCUIT VERIFICATION (SP1) =====
    const circuitResult = executeCircuit(text, job.minWords, job.category);

    if (!circuitResult.verified) {
      return NextResponse.json(
        {
          error: `ZK verification failed: word count ${circuitResult.wordCount} is below minimum ${circuitResult.minWords}`,
          proofData: circuitResult,
        },
        { status: 400 }
      );
    }

    const textHash = circuitResult.textHash;
    const actualWordCount = circuitResult.wordCount;
    const zkVerified = circuitResult.verified;

    const proofData = {
      circuit: "sp1-word-count",
      ...circuitResult,
    };

    // Build a proof hex string from the proof data
    const proofHex = crypto
      .createHash("sha256")
      .update(JSON.stringify(proofData))
      .digest("hex");

    const [submission, updatedJob] = await prisma.$transaction(async (tx) => {
      // Store the full output text if provided (from arena/fulfill or user submission)
      const storedOutputText = typeof bodyOutputText === "string" ? bodyOutputText : (typeof text === "string" ? text : null);

      const sub = await tx.submission.create({
        data: {
          jobId: id,
          takerWallet,
          textHash,
          wordCount: actualWordCount,
          proofHex,
          verified: zkVerified,
          outputText: storedOutputText,
        },
      });

      const updated = await tx.job.update({
        where: { id },
        data: { status: "Completed" },
      });

      await tx.reputation.upsert({
        where: { walletAddress: takerWallet },
        create: {
          walletAddress: takerWallet,
          jobsCompleted: 1,
          totalEarned: job.amount,
          firstJobAt: new Date(),
        },
        update: {
          jobsCompleted: { increment: 1 },
          totalEarned: { increment: job.amount },
          firstJobAt: undefined,
        },
      });

      // Set firstJobAt if it was null
      const rep = await tx.reputation.findUnique({
        where: { walletAddress: takerWallet },
      });
      if (rep && !rep.firstJobAt) {
        await tx.reputation.update({
          where: { walletAddress: takerWallet },
          data: { firstJobAt: new Date() },
        });
      }

      return [sub, updated];
    });

    // Send Solana marker transaction (non-blocking)
    let txHash: string | null = null;
    try {
      txHash = await sendMarkerTransaction("submit_completion:" + id);
      await Promise.all([
        prisma.submission.update({
          where: { id: submission.id },
          data: { txHash },
        }),
        prisma.transaction.create({
          data: {
            txHash,
            type: "submit_completion",
            jobId: id,
            wallet: takerWallet,
            amount: job.amount,
            status: "confirmed",
          },
        }),
      ]);
    } catch (err) {
      console.error("[solana] Failed to send marker tx for submit_completion:", err);
    }

    // Real SPL token escrow release: transfer USDC from escrow to taker
    let paymentTxHash: string | null = null;
    try {
      const releaseResult = await releaseFundsToTaker(takerWallet, job.amount);
      paymentTxHash = releaseResult.txHash;
      await prisma.transaction.create({
        data: {
          txHash: paymentTxHash,
          type: "escrow_release",
          jobId: id,
          wallet: takerWallet,
          amount: job.amount,
          status: "confirmed",
        },
      });
    } catch (err) {
      console.error("[escrow] Failed to release funds:", err);
      // Fallback: try old payment marker
      try {
        const deployerKp = JSON.parse(process.env.DEPLOYER_KEYPAIR || "[]");
        if (deployerKp.length > 0) {
          const payment = await sendX402Payment(deployerKp, takerWallet, 0.001, "payment_released:" + id);
          paymentTxHash = payment.txHash;
          await prisma.transaction.create({
            data: {
              txHash: paymentTxHash,
              type: "payment_released",
              jobId: id,
              wallet: takerWallet,
              amount: job.amount,
              status: "confirmed",
            },
          });
        }
      } catch (fallbackErr) {
        console.error("[solana] Fallback payment marker also failed:", fallbackErr);
      }
    }

    return NextResponse.json({
      job: updatedJob,
      submission: { ...submission, txHash },
      txHash,
      paymentTxHash,
      proofData,
    });
  } catch (error) {
    console.error("POST /api/jobs/[id]/submit error:", error);
    return NextResponse.json(
      { error: "Failed to submit work" },
      { status: 500 }
    );
  }
}
