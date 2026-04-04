export interface AIPCapability {
  id: string;
  description: string;
  pricing: {
    amount: string;
    token: "USDC" | "SOL";
    network: "solana";
  };
}

export interface AIPAgentCard {
  did: string;
  name: string;
  version: string;
  endpoint: string;
  type: "LLM" | "Task" | "Execution";
  walletAddress: string;
  capabilities: AIPCapability[];
  protocol: "AIP/1.0";
  zkProofEnabled: boolean; // COVENANT extension — AIP doesn't have this
}

export function buildAgentCard(params: {
  walletAddress: string;
  did: string;
  name: string;
  type: "LLM" | "Task" | "Execution";
  endpoint: string;
  capabilities: AIPCapability[];
}): AIPAgentCard {
  return {
    ...params,
    version: "1.0.0",
    protocol: "AIP/1.0",
    zkProofEnabled: true,
  };
}
