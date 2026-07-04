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
import { requireAuth } from "@/lib/require-auth";
import { log } from "@/lib/logger";
import { FAUCET_ENABLED, getClusterLabel } from "@/lib/network";

export async function POST(request: NextRequest) {
  // The faucet mints test USDC and is devnet-only. On mainnet there is no
  // test mint to hand out, so refuse rather than attempt a mint that would
  // fail against the canonical USDC mint.
  if (!FAUCET_ENABLED) {
    return NextResponse.json(
      { error: `Faucet is disabled on ${getClusterLabel()}.` },
      { status: 403 },
    );
  }
  try {
    const __raw = await request.text();
    const __auth = await requireAuth(request, { rawBody: __raw });
    if (!__auth.ok)
      return NextResponse.json({ error: __auth.reason }, { status: __auth.status });
    const body = __raw ? JSON.parse(__raw) : {};
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
    log.forRequest(request).info("faucet mint", {
      wallet: walletAddress,
      amount,
      txHash: result.txHash,
    });

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
