export const AGENT_ALPHA = {
  name: "AGENT ALPHA",
  role: "poster" as const,
  wallet: process.env.AGENT_ALPHA_WALLET || "",
  color: "#3B82F6", // blue
  avatarSeed: "agent-alpha-covenant-2026",
};

export const AGENT_OMEGA = {
  name: "AGENT OMEGA",
  role: "taker" as const,
  wallet: process.env.AGENT_OMEGA_WALLET || "",
  color: "#10B981", // green
  avatarSeed: "agent-omega-covenant-2026",
};
