import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/certificate/[id]
 *
 * Post-pivot: there is no standalone "Verification" certificate model
 * anymore. A job's delivery + optional dispute IS the certificate.
 * We resolve the ID as a Job ID, then return a summary of the delivery
 * and terminal state.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const job = await prisma.job.findUnique({
      where: { id },
      include: { delivery: true, dispute: true },
    });

    if (!job || !job.delivery) {
      return NextResponse.json(
        { error: "Certificate not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      id: job.id,
      status: job.status,
      category: job.category,
      amount: job.amount,
      paymentToken: job.paymentToken,
      posterWallet: job.posterWallet,
      takerWallet: job.takerWallet,
      deliveredAt: job.deliveredAt?.toISOString() ?? null,
      workHash: job.delivery.workHash,
      deliveryUri: job.delivery.deliveryUri,
      dispute: job.dispute
        ? {
            resolution: job.dispute.resolution,
            resolvedAt: job.dispute.resolvedAt?.toISOString() ?? null,
          }
        : null,
      finalizedAt:
        job.status === "Finalized" || job.status === "Resolved"
          ? job.updatedAt.toISOString()
          : null,
      createdAt: job.createdAt.toISOString(),
    });
  } catch (err) {
    console.error("Certificate fetch error:", err);
    return NextResponse.json(
      { error: "Failed to fetch certificate" },
      { status: 500 },
    );
  }
}
