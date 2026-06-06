import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { prisma } from "@/lib/prisma";
import { fetchJobEscrow } from "@/lib/program-server";
import { reconcileJobRow } from "@/lib/onchain-verify";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        submissions: true,
        delivery: true,
        dispute: true,
        claim: true,
        interests: {
          where: { status: "working" },
          select: { takerWallet: true, acceptedAt: true },
        },
      },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // C-021: chain is the source of truth — heal any DB drift on read. If the
    // RPC is unreachable, fall back to the DB mirror (non-fatal).
    if (job.pda) {
      try {
        const escrow = await fetchJobEscrow(new PublicKey(job.pda));
        if (escrow) {
          const { drifted, updates } = reconcileJobRow(
            { status: job.status, takerWallet: job.takerWallet, amount: job.amount },
            escrow,
          );
          if (drifted) {
            await prisma.job.update({ where: { id: job.id }, data: updates });
            Object.assign(job, updates);
          }
        }
      } catch (err) {
        console.error("[jobs/[id]] on-read reconcile (non-fatal):", err);
      }
    }

    return NextResponse.json(job);
  } catch (error) {
    console.error("GET /api/jobs/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch job" },
      { status: 500 }
    );
  }
}
