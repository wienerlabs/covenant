import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/claims/activity
 *
 * Recent claim-lifecycle events for the live activity feed on /credit.
 * Derived from ClaimListing timestamps — no separate event table.
 *
 * Returns up to `limit` events (default 20) sorted by most recent first.
 * Each event is one of:
 *   - listed: taker listed a claim
 *   - bought: lender bought a listed claim
 *   - settled: finalize_payment routed escrow to the buyer
 *   - cancelled: seller cancelled an unsold listing
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.max(
      1,
      Math.min(100, parseInt(searchParams.get("limit") ?? "20", 10)),
    );

    // Fetch the candidate set (3x limit so we have headroom after dedup).
    const rows = await prisma.claimListing.findMany({
      orderBy: { updatedAt: "desc" },
      take: limit * 3,
      include: {
        job: {
          select: {
            id: true,
            specJson: true,
            category: true,
            amount: true,
          },
        },
      },
    });

    type Event = {
      type: "listed" | "bought" | "settled" | "cancelled";
      at: string;
      claimId: string;
      jobId: string;
      jobTitle: string;
      category: string;
      amount: number; // face value USDC
      price?: number; // for listed/bought
      sellerWallet: string;
      buyerWallet: string | null;
      txHash: string | null;
    };

    const events: Event[] = [];
    for (const c of rows) {
      const jobTitle =
        (c.job.specJson as { title?: string } | null)?.title ??
        `Job ${c.jobId.slice(0, 6)}`;
      const base = {
        claimId: c.id,
        jobId: c.jobId,
        jobTitle,
        category: c.job.category,
        amount: c.faceValue,
        sellerWallet: c.sellerWallet,
        buyerWallet: c.buyerWallet,
      };

      events.push({
        type: "listed",
        at: c.listedAt.toISOString(),
        price: c.price,
        txHash: c.listTxHash,
        ...base,
      });
      if (c.boughtAt) {
        events.push({
          type: "bought",
          at: c.boughtAt.toISOString(),
          price: c.price,
          txHash: c.buyTxHash,
          ...base,
        });
      }
      if (c.settledAt) {
        events.push({
          type: "settled",
          at: c.settledAt.toISOString(),
          txHash: c.settleTxHash,
          ...base,
        });
      }
      if (c.status === "Cancelled" && c.cancelTxHash) {
        // Cancel wasn't timestamped independently; fall back to updatedAt.
        events.push({
          type: "cancelled",
          at: c.updatedAt.toISOString(),
          txHash: c.cancelTxHash,
          ...base,
        });
      }
    }

    events.sort((a, b) => b.at.localeCompare(a.at));

    return NextResponse.json({
      events: events.slice(0, limit),
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("GET /api/claims/activity error:", error);
    return NextResponse.json(
      { error: "Failed to fetch activity" },
      { status: 500 },
    );
  }
}
