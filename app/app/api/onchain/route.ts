import { NextResponse } from "next/server";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { PROGRAM_ID, DEVNET_ENDPOINT } from "@/lib/constants";

export const dynamic = "force-dynamic";

const DEPLOYER_WALLET = process.env.NEXT_PUBLIC_DEPLOYER_WALLET || "5GqypzTESTWALLET";
const AGENT_ALPHA_WALLET = process.env.NEXT_PUBLIC_AGENT_ALPHA_WALLET || "GMCRqvQyyu5WvoaWF4apE1A39W5SaoXUJkGkdvHpGQ9v";
const AGENT_OMEGA_WALLET = process.env.NEXT_PUBLIC_AGENT_OMEGA_WALLET || "55EbEM7x6WQxVFSt1KennwYBPgWF7GgF5bd2R2FVxiw1";

async function getBalance(connection: Connection, address: string): Promise<number> {
  try {
    const pubkey = new PublicKey(address);
    const lamports = await connection.getBalance(pubkey);
    return lamports / LAMPORTS_PER_SOL;
  } catch {
    return 0;
  }
}

export async function GET() {
  try {
    const connection = new Connection(DEVNET_ENDPOINT, "confirmed");

    // Fetch program account info
    let programInfo: {
      executable: boolean;
      size: number;
      lamports: number;
    } | null = null;

    try {
      const account = await connection.getAccountInfo(PROGRAM_ID);
      if (account) {
        programInfo = {
          executable: account.executable,
          size: account.data.length,
          lamports: account.lamports,
        };
      }
    } catch {
      // Program might not exist on devnet
    }

    // Fetch wallet balances in parallel
    const [deployerBalance, alphaBalance, omegaBalance] = await Promise.all([
      getBalance(connection, DEPLOYER_WALLET),
      getBalance(connection, AGENT_ALPHA_WALLET),
      getBalance(connection, AGENT_OMEGA_WALLET),
    ]);

    return NextResponse.json({
      program: {
        id: PROGRAM_ID.toBase58(),
        executable: programInfo?.executable ?? null,
        size: programInfo?.size ?? null,
        lamports: programInfo?.lamports ?? null,
        balance: programInfo ? programInfo.lamports / LAMPORTS_PER_SOL : null,
      },
      wallets: {
        deployer: { address: DEPLOYER_WALLET, balance: deployerBalance },
        alpha: { address: AGENT_ALPHA_WALLET, balance: alphaBalance },
        omega: { address: AGENT_OMEGA_WALLET, balance: omegaBalance },
      },
    });
  } catch (error) {
    console.error("GET /api/onchain error:", error);
    return NextResponse.json(
      { error: "Failed to fetch on-chain data" },
      { status: 500 }
    );
  }
}
