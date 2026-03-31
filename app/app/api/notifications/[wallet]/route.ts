import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface Notification {
  id: string;
  type: string;
  message: string;
  jobId: string | null;
  txHash: string | null;
  read: boolean;
  createdAt: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ wallet: string }> }
) {
  try {
    const { wallet } = await params;

    if (!wallet) {
      return NextResponse.json(
        { error: "wallet is required" },
        { status: 400 }
      );
    }

    // Fetch jobs where user is poster or taker
    const jobs = await prisma.job.findMany({
      where: {
        OR: [
          { posterWallet: wallet },
          { takerWallet: wallet },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 30,
    });

    // Fetch transactions for this wallet
    const transactions = await prisma.transaction.findMany({
      where: { wallet },
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    const notifications: Notification[] = [];

    // Build notifications from jobs
    for (const job of jobs) {
      const shortTaker = job.takerWallet
        ? job.takerWallet.slice(0, 4) + "..." + job.takerWallet.slice(-4)
        : null;
      const shortPoster = job.posterWallet.slice(0, 4) + "..." + job.posterWallet.slice(-4);
      const isPoster = job.posterWallet === wallet;

      if (job.status === "Accepted" && isPoster && job.takerWallet) {
        notifications.push({
          id: `job_accepted_${job.id}`,
          type: "job_accepted",
          message: `Your job was accepted by ${shortTaker}`,
          jobId: job.id,
          txHash: null,
          read: false,
          createdAt: job.updatedAt.toISOString(),
        });
      }

      if (job.status === "Completed") {
        if (isPoster) {
          notifications.push({
            id: `job_completed_poster_${job.id}`,
            type: "job_completed",
            message: `Job completed — ${job.amount.toFixed(2)} ${job.paymentToken} released`,
            jobId: job.id,
            txHash: null,
            read: false,
            createdAt: job.updatedAt.toISOString(),
          });
        } else if (job.takerWallet === wallet) {
          notifications.push({
            id: `job_completed_taker_${job.id}`,
            type: "job_completed",
            message: `You completed a job — ${job.amount.toFixed(2)} ${job.paymentToken} earned`,
            jobId: job.id,
            txHash: null,
            read: false,
            createdAt: job.updatedAt.toISOString(),
          });
        }
      }

      if (job.status === "Cancelled") {
        notifications.push({
          id: `job_cancelled_${job.id}`,
          type: "job_cancelled",
          message: isPoster
            ? "Your job was cancelled"
            : `Job by ${shortPoster} was cancelled`,
          jobId: job.id,
          txHash: null,
          read: false,
          createdAt: job.updatedAt.toISOString(),
        });
      }

      // Notify takers about new jobs they accepted (job creation event)
      if (job.takerWallet === wallet && job.status !== "Open") {
        notifications.push({
          id: `job_created_${job.id}`,
          type: "job_created",
          message: `New job posted by ${shortPoster} — ${job.amount.toFixed(2)} ${job.paymentToken}`,
          jobId: job.id,
          txHash: job.txHash,
          read: false,
          createdAt: job.createdAt.toISOString(),
        });
      }
    }

    // Enrich notifications with transaction hashes
    const txByJobAndType = new Map<string, string>();
    for (const tx of transactions) {
      if (tx.jobId) {
        txByJobAndType.set(`${tx.type}_${tx.jobId}`, tx.txHash);
      }
    }

    for (const n of notifications) {
      if (!n.txHash && n.jobId) {
        const typeMap: Record<string, string> = {
          job_accepted: "accept_job",
          job_completed: "submit_completion",
          job_cancelled: "cancel_job",
          job_created: "create_job",
        };
        const txType = typeMap[n.type];
        if (txType) {
          const hash = txByJobAndType.get(`${txType}_${n.jobId}`);
          if (hash) n.txHash = hash;
        }
      }
    }

    // Sort by createdAt desc, limit 20
    notifications.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return NextResponse.json(notifications.slice(0, 20));
  } catch (error) {
    console.error("GET /api/notifications/[wallet] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}
