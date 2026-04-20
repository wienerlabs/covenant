import { NextRequest, NextResponse } from "next/server";

// Force Node.js runtime — Prisma does not run on Edge. Without this hint
// Vercel can occasionally pick Edge for dynamic routes under the wrong
// conditions and the whole module fails to initialize → opaque 500.
export const runtime = "nodejs";

// Dynamic so Next never tries to cache a (possibly failing) response.
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Notification {
  id: string;
  type: string;
  message: string;
  jobId: string | null;
  txHash: string | null;
  read: boolean;
  createdAt: string;
}

/** Base58 wallet shape guard. */
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
 * CONTRACT: this endpoint MUST NEVER return a 5xx. It is polled every
 * few seconds by the frontend; a 500 floods both browser console and
 * server logs. If anything goes wrong — missing env, broken Prisma
 * client, schema drift, Edge runtime accident, unknown runtime error —
 * we log it server-side and return `[]` to the client.
 *
 * Strategy:
 *   1. Top-level try/catch wraps the entire handler body
 *   2. Prisma is imported lazily INSIDE the try/catch so a module-load
 *      failure of @/lib/prisma (e.g. generated client missing on an
 *      edge-case deploy) is recoverable
 *   3. Each individual Prisma query is isolated in its own try/catch
 *   4. Each per-job row is processed in its own try/catch
 *   5. Date coercion, number formatting, and wallet truncation never
 *      throw on null / undefined / malformed input
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ wallet: string }> },
) {
  try {
    // ---- 1. Resolve params ----
    let wallet: string | undefined;
    try {
      const p = await params;
      wallet = p?.wallet;
    } catch {
      /* fall through — wallet stays undefined → empty array */
    }
    if (!wallet || !looksLikeWallet(wallet)) {
      return NextResponse.json([]);
    }

    // ---- 2. Lazy-load Prisma ----
    // If @/lib/prisma fails to evaluate (missing DATABASE_URL, broken
    // generated client, etc.) we catch it here and serve empty instead
    // of letting Next.js emit a 500.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let prisma: any;
    try {
      prisma = (await import("@/lib/prisma")).prisma;
      if (!prisma) {
        throw new Error("prisma export missing from @/lib/prisma");
      }
    } catch (err) {
      console.error("[notifications] prisma import failed:", err);
      return NextResponse.json([]);
    }

    // ---- 3. Queries (each isolated) ----
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

    // ---- 4. Build notifications (per-row safety) ----
    const notifications: Notification[] = [];
    for (const job of jobs) {
      try {
        if (!job || typeof job !== "object" || !job.id) continue;
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

    // ---- 5. Transaction hash enrichment (best effort) ----
    try {
      const txByJobAndType = new Map<string, string>();
      for (const tx of transactions) {
        if (tx?.jobId && tx?.txHash) {
          txByJobAndType.set(`${tx.type}_${tx.jobId}`, tx.txHash);
        }
      }
      const typeMap: Record<string, string> = {
        job_accepted: "accept_job",
        job_completed: "submit_completion",
        job_cancelled: "cancel_job",
        job_created: "create_job",
      };
      for (const n of notifications) {
        if (!n.txHash && n.jobId) {
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

    // ---- 6. Sort + respond ----
    try {
      notifications.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    } catch {
      /* sort failure → unsorted is fine */
    }

    return NextResponse.json(notifications.slice(0, 20));
  } catch (err) {
    // Absolute last resort. Whatever happened, don't 500.
    console.error("[notifications] fatal:", err);
    try {
      return NextResponse.json([]);
    } catch {
      // Even JSON serialization failed — raw 200 body.
      return new NextResponse("[]", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  }
}
