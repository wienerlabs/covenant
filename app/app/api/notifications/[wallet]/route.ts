import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface Notification {
  id: string;
  type: string;
  message: string;
  jobId: string | null;
  txHash: string | null;
  read: boolean;
  createdAt: string;
}

/** Wallet addresses are base58 32-44 chars — validate before querying. */
function looksLikeWallet(w: unknown): w is string {
  return typeof w === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(w);
}

function fmtAmount(n: unknown): string {
  const num = typeof n === "number" ? n : Number(n);
  return Number.isFinite(num) ? num.toFixed(2) : "0.00";
}

function shortWallet(w: string | null | undefined): string {
  if (!w || w.length < 8) return w ?? "unknown";
  return `${w.slice(0, 4)}...${w.slice(-4)}`;
}

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

/**
 * GET /api/notifications/[wallet]
 *
 * Frontend polls this repeatedly; a 500 here storms the console and
 * the logs. We bias hard toward returning an empty array on ANY
 * failure — the endpoint is best-effort notifications, not a critical
 * data source.
 *
 * Every internal step is individually try/catched AND the whole
 * function is wrapped in a top-level try/catch that returns `[]` on
 * unexpected errors (e.g. Prisma init failures, schema drift against
 * production DB, runtime module issues).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ wallet: string }> },
) {
  try {
    let wallet: string | undefined;
    try {
      const p = await params;
      wallet = p?.wallet;
    } catch {
      // params resolution failed
    }

    if (!wallet) {
      return NextResponse.json([]);
    }
    if (!looksLikeWallet(wallet)) {
      return NextResponse.json([]);
    }

    // Each query is isolated so a transient failure in one (e.g.
    // schema drift on the production DB) doesn't take out the other.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let jobs: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let transactions: any[] = [];

    try {
      jobs = await prisma.job.findMany({
        where: {
          OR: [{ posterWallet: wallet }, { takerWallet: wallet }],
        },
        orderBy: { updatedAt: "desc" },
        take: 30,
      });
    } catch (err) {
      console.error("[notifications] job.findMany failed:", err);
    }

    try {
      transactions = await prisma.transaction.findMany({
        where: { wallet },
        orderBy: { createdAt: "desc" },
        take: 30,
      });
    } catch (err) {
      console.error("[notifications] transaction.findMany failed:", err);
    }

    const notifications: Notification[] = [];

    // Per-row try/catch so one malformed row can't abort the whole loop.
    for (const job of jobs) {
      try {
        if (!job || !job.id) continue;
        const shortTaker = shortWallet(job.takerWallet);
        const shortPoster = shortWallet(job.posterWallet);
        const isPoster = job.posterWallet === wallet;
        const amount = fmtAmount(job.amount);
        const token = job.paymentToken ?? "USDC";
        const updatedIso = toIso(job.updatedAt);
        const createdIso = toIso(job.createdAt);

        if (job.status === "Accepted" && isPoster && job.takerWallet) {
          notifications.push({
            id: `job_accepted_${job.id}`,
            type: "job_accepted",
            message: `Your job was accepted by ${shortTaker}`,
            jobId: job.id,
            txHash: null,
            read: false,
            createdAt: updatedIso,
          });
        }

        if (job.status === "Completed") {
          if (isPoster) {
            notifications.push({
              id: `job_completed_poster_${job.id}`,
              type: "job_completed",
              message: `Job completed — ${amount} ${token} released`,
              jobId: job.id,
              txHash: null,
              read: false,
              createdAt: updatedIso,
            });
          } else if (job.takerWallet === wallet) {
            notifications.push({
              id: `job_completed_taker_${job.id}`,
              type: "job_completed",
              message: `You completed a job — ${amount} ${token} earned`,
              jobId: job.id,
              txHash: null,
              read: false,
              createdAt: updatedIso,
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
            createdAt: updatedIso,
          });
        }

        if (job.takerWallet === wallet && job.status !== "Open") {
          notifications.push({
            id: `job_created_${job.id}`,
            type: "job_created",
            message: `New job posted by ${shortPoster} — ${amount} ${token}`,
            jobId: job.id,
            txHash: job.txHash ?? null,
            read: false,
            createdAt: createdIso,
          });
        }
      } catch (err) {
        console.error(
          "[notifications] skipping malformed job row:",
          job?.id,
          err,
        );
      }
    }

    // Enrich with transaction hashes (best effort).
    try {
      const txByJobAndType = new Map<string, string>();
      for (const tx of transactions) {
        if (tx?.jobId && tx?.txHash) {
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
    } catch (err) {
      console.error("[notifications] tx enrichment failed:", err);
    }

    notifications.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return NextResponse.json(notifications.slice(0, 20));
  } catch (err) {
    // Absolute last resort — never let this endpoint 500 the frontend
    // poll loop. Log + serve empty.
    console.error("[notifications] fatal:", err);
    return NextResponse.json([]);
  }
}
