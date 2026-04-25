import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mintTestUSDC, getTokenBalance } from "@/lib/escrow";
import { rateLimit } from "@/lib/rateLimit";
import { FAUCET_ENABLED, getClusterLabel } from "@/lib/network";

export async function POST(request: NextRequest) {
  // Faucet is only meaningful on devnet — refuse to mint on mainnet so
  // production deploys can't be tricked into invoking the test mint.
  if (!FAUCET_ENABLED) {
    return NextResponse.json(
      {
        error: `Faucet disabled on ${getClusterLabel()}. Use real USDC on mainnet, or switch to devnet.`,
      },
      { status: 403 },
    );
  }

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

    // Rate limit: 1 per wallet per hour
    const rl = rateLimit(`faucet:${walletAddress}`, 1, 60 * 60 * 1000);
    if (!rl.allowed) {
      const retryAfter = Math.ceil((rl.resetAt - Date.now()) / 1000);
      return NextResponse.json(
        { error: `Rate limited. Try again in ${Math.ceil(retryAfter / 60)} minutes.` },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfter) },
        }
      );
    }

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
