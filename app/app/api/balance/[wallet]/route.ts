import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getTokenBalance } from "@/lib/escrow";
import { DEVNET_ENDPOINT } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ wallet: string }> }
) {
  try {
    const { wallet } = await params;

    if (!wallet || wallet.length < 32 || wallet.length > 44) {
      return NextResponse.json(
        { error: "Invalid wallet address" },
        { status: 400 }
      );
    }

    const connection = new Connection(DEVNET_ENDPOINT, "confirmed");
    const pubkey = new PublicKey(wallet);

    // Fetch SOL and USDC balances in parallel
    const [solLamports, usdc] = await Promise.all([
      connection.getBalance(pubkey).catch(() => 0),
      getTokenBalance(wallet),
    ]);

    const sol = solLamports / LAMPORTS_PER_SOL;

    return NextResponse.json({ sol, usdc });
  } catch (error) {
    console.error("GET /api/balance/[wallet] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch balance" },
      { status: 500 }
    );
  }
}
