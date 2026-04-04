import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMarkerTransaction } from "@/lib/solana";
import { refundToPoster } from "@/lib/escrow";
import { Keypair } from "@solana/web3.js";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { signerWallet } = body;

    if (!signerWallet || typeof signerWallet !== "string") {
      return NextResponse.json(
        { error: "signerWallet is required" },
        { status: 400 }
      );
    }

    const job = await prisma.job.findUnique({ where: { id } });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Case 1: Open job can be cancelled by poster
    if (job.status === "Open" && signerWallet === job.posterWallet) {
      const updatedJob = await prisma.job.update({
        where: { id },
        data: { status: "Cancelled" },
      });

      // Send Solana marker transaction (non-blocking)
      let txHash: string | null = null;
      try {
        txHash = await sendMarkerTransaction("cancel_job:" + id);
        await prisma.transaction.create({
          data: {
            txHash,
            type: "cancel_job",
            jobId: id,
            wallet: signerWallet,
            amount: job.amount,
            status: "confirmed",
          },
        });
      } catch (err) {
        console.error("[solana] Failed to send marker tx for cancel_job:", err);
      }

      // Attempt real token refund for known wallets
      const knownWallets: Record<string, string> = {};
      if (process.env.AGENT_ALPHA_WALLET) knownWallets[process.env.AGENT_ALPHA_WALLET] = "AGENT_ALPHA_KEYPAIR";
      if (process.env.AGENT_OMEGA_WALLET) knownWallets[process.env.AGENT_OMEGA_WALLET] = "AGENT_OMEGA_KEYPAIR";
      try {
        const deployerKpRaw = JSON.parse(process.env.DEPLOYER_KEYPAIR || "[]");
        if (deployerKpRaw.length > 0) {
          const deployerWallet = Keypair.fromSecretKey(Uint8Array.from(deployerKpRaw)).publicKey.toBase58();
          knownWallets[deployerWallet] = "DEPLOYER_KEYPAIR";
        }
      } catch { /* ignore */ }

      const keypairEnv = knownWallets[job.posterWallet];
      if (keypairEnv && job.paymentToken === "USDC") {
        try {
          const result = await refundToPoster(keypairEnv, job.amount);
          await prisma.transaction.create({
            data: {
              txHash: result.txHash,
              type: "escrow_refund",
              jobId: id,
              wallet: job.posterWallet,
              amount: job.amount,
              status: "confirmed",
            },
          });
        } catch (err) {
          console.error("[escrow] Refund failed:", err);
        }
      }

      return NextResponse.json({ ...updatedJob, txHash });
    }

    // Case 2: Accepted job can be cancelled after deadline passes
    if (job.status === "Accepted" && new Date() > job.deadline) {
      const updatedJob = await prisma.$transaction(async (tx) => {
        const updated = await tx.job.update({
          where: { id },
          data: { status: "Cancelled" },
        });

        if (job.takerWallet) {
          await tx.reputation.upsert({
            where: { walletAddress: job.takerWallet },
            create: {
              walletAddress: job.takerWallet,
              jobsFailed: 1,
            },
            update: {
              jobsFailed: { increment: 1 },
            },
          });
        }

        return updated;
      });

      // Send Solana marker transaction (non-blocking)
      let txHash: string | null = null;
      try {
        txHash = await sendMarkerTransaction("cancel_job:" + id);
        await prisma.transaction.create({
          data: {
            txHash,
            type: "cancel_job",
            jobId: id,
            wallet: signerWallet,
            amount: job.amount,
            status: "confirmed",
          },
        });
      } catch (err) {
        console.error("[solana] Failed to send marker tx for cancel_job:", err);
      }

      // Attempt real token refund for known wallets
      const knownWallets2: Record<string, string> = {};
      if (process.env.AGENT_ALPHA_WALLET) knownWallets2[process.env.AGENT_ALPHA_WALLET] = "AGENT_ALPHA_KEYPAIR";
      if (process.env.AGENT_OMEGA_WALLET) knownWallets2[process.env.AGENT_OMEGA_WALLET] = "AGENT_OMEGA_KEYPAIR";
      try {
        const deployerKpRaw2 = JSON.parse(process.env.DEPLOYER_KEYPAIR || "[]");
        if (deployerKpRaw2.length > 0) {
          const deployerWallet2 = Keypair.fromSecretKey(Uint8Array.from(deployerKpRaw2)).publicKey.toBase58();
          knownWallets2[deployerWallet2] = "DEPLOYER_KEYPAIR";
        }
      } catch { /* ignore */ }

      const keypairEnv2 = knownWallets2[job.posterWallet];
      if (keypairEnv2 && job.paymentToken === "USDC") {
        try {
          const result = await refundToPoster(keypairEnv2, job.amount);
          await prisma.transaction.create({
            data: {
              txHash: result.txHash,
              type: "escrow_refund",
              jobId: id,
              wallet: job.posterWallet,
              amount: job.amount,
              status: "confirmed",
            },
          });
        } catch (err) {
          console.error("[escrow] Refund failed:", err);
        }
      }

      return NextResponse.json({ ...updatedJob, txHash });
    }

    return NextResponse.json(
      { error: "Cannot cancel this job. Either you are not the poster, the job is not Open, or the deadline has not passed for an Accepted job." },
      { status: 400 }
    );
  } catch (error) {
    console.error("POST /api/jobs/[id]/cancel error:", error);
    return NextResponse.json(
      { error: "Failed to cancel job" },
      { status: 500 }
    );
  }
}
