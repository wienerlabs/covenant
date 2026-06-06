import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mintTestUSDC, getTokenBalance } from "@/lib/escrow";
import {
  rateLimitDurable,
  rateLimited429,
  compoundKey,
  getLimit,
  ipFromRequest,
} from "@/lib/rateLimit";

export async function POST(request: NextRequest) {
  // Devnet-only deployment — faucet is always live.
  try {
    const body = await request.json();
    const { walletAddress } = body;

    if (!walletAddress || typeof walletAddress !== "string") {
      return NextResponse.json(
        { error: "walletAddress is required" },
        { status: 400 }
      );
    }

    // Validate it looks like a Solana public key (32-44 base58 chars)
    if (walletAddress.length < 32 || walletAddress.length > 44) {
      return NextResponse.json(
        { error: "Invalid Solana wallet address" },
        { status: 400 }
      );
    }

    // Rate limit (durable, distributed — H-04): 1/hour per wallet AND
    // 10/hour per IP, so one IP can't drain the faucet across many wallets.
    // The shared Postgres counter survives Vercel's per-container split.
    const fWallet = getLimit("faucet");
    const byWallet = await rateLimitDurable(
      compoundKey({ op: "faucet", wallet: walletAddress }),
      fWallet.limit,
      fWallet.windowMs,
    );
    if (!byWallet.allowed) return rateLimited429(byWallet);

    const fIp = getLimit("faucet_ip");
    const byIp = await rateLimitDurable(
      compoundKey({ op: "faucet_ip", ip: ipFromRequest(request) }),
      fIp.limit,
      fIp.windowMs,
    );
    if (!byIp.allowed) return rateLimited429(byIp);

    const amount = 100; // 100 test USDC per faucet request

    const result = await mintTestUSDC(walletAddress, amount);

    // Store the faucet transaction
    try {
      await prisma.transaction.create({
        data: {
          txHash: result.txHash,
          type: "faucet_mint",
          wallet: walletAddress,
          amount,
          status: "confirmed",
        },
      });
    } catch {
      // Non-blocking: DB write failure shouldn't break faucet
    }

    const balance = await getTokenBalance(walletAddress);

    return NextResponse.json({
      success: true,
      txHash: result.txHash,
      ata: result.ata,
      amount,
      balance,
    });
  } catch (error) {
    console.error("POST /api/faucet error:", error);
    return NextResponse.json(
      { error: "Faucet failed: " + (error instanceof Error ? error.message : "Unknown error") },
      { status: 500 }
    );
  }
}
