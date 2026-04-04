export const AGENT_ALPHA = {
  name: "AGENT ALPHA",
  role: "poster" as const,
  wallet: process.env.AGENT_ALPHA_WALLET || "",
  color: "#42BDFF", // blue
  avatarSeed: "agent-alpha-covenant-2026",
};

export const AGENT_OMEGA = {
  name: "AGENT OMEGA",
  role: "taker" as const,
  wallet: process.env.AGENT_OMEGA_WALLET || "",
  color: "#FF425E", // red
  avatarSeed: "agent-omega-covenant-2026",
};
