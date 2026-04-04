import { NextRequest, NextResponse } from "next/server";
import { buildEscrowLockTransaction, checkUSDCBalance } from "@/lib/client-escrow";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { posterWallet, amount } = body;

    if (!posterWallet || typeof posterWallet !== "string") {
      return NextResponse.json(
        { error: "posterWallet is required" },
        { status: 400 }
      );
    }

    if (!amount || typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { error: "amount must be a positive number" },
        { status: 400 }
      );
    }

    // Check balance first
    const balance = await checkUSDCBalance(posterWallet);
    if (balance < amount) {
      return NextResponse.json(
        {
          error: `Insufficient USDC balance. You have ${balance.toFixed(2)} USDC but need ${amount} USDC.`,
          balance,
          required: amount,
        },
        { status: 400 }
      );
    }

    const result = await buildEscrowLockTransaction(posterWallet, amount);

    return NextResponse.json({
      transaction: result.transaction,
      escrowAta: result.escrowAta,
      posterAta: result.posterAta,
      amount,
      balance,
    });
  } catch (error) {
    console.error("POST /api/escrow/build error:", error);
    return NextResponse.json(
      { error: "Failed to build escrow transaction: " + (error instanceof Error ? error.message : "Unknown error") },
      { status: 500 }
    );
  }
}
