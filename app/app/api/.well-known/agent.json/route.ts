import { NextResponse } from "next/server";
import { generateDID } from "@/lib/aip/did";
import { buildAgentCard } from "@/lib/aip/agent-card";

const DEPLOYER_WALLET = process.env.AGENT_ALPHA_WALLET || "GMCRqvQyyu5WvoaWF4apE1A39W5SaoXUJkGkdvHpGQ9v";

export async function GET() {
  const did = generateDID(DEPLOYER_WALLET);
  const card = buildAgentCard({
    walletAddress: DEPLOYER_WALLET,
    did,
    name: "COVENANT Protocol",
    type: "Task",
    endpoint: "https://covenant-omega.vercel.app/api/a2a",
    capabilities: [
      { id: "text.write", description: "Write articles with ZK-verified word count", pricing: { amount: "5", token: "USDC", network: "solana" } },
      { id: "code.review", description: "Review code with verified analysis", pricing: { amount: "10", token: "USDC", network: "solana" } },
      { id: "text.translate", description: "Translate text between languages", pricing: { amount: "8", token: "USDC", network: "solana" } },
    ],
  });
  return NextResponse.json(card);
}
