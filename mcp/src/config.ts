/**
 * Runtime configuration for the Covenant MCP server.
 *
 * Everything is environment-driven so the same binary works against
 * the hosted devnet deployment, a local dev server, or a future
 * mainnet endpoint with zero code changes.
 */

export interface CovenantMcpConfig {
  /** Base URL of the Covenant HTTP API. Defaults to the hosted devnet app. */
  baseUrl: string;
  /** Network label surfaced to the agent so it knows it is on devnet. */
  network: string;
  /** Request timeout in milliseconds. */
  timeoutMs: number;
}

export function loadConfig(): CovenantMcpConfig {
  const baseUrl = (
    process.env.COVENANT_API_URL ?? "https://www.covenant.run"
  ).replace(/\/+$/, "");

  return {
    baseUrl,
    network: process.env.COVENANT_NETWORK ?? "devnet",
    timeoutMs: Number(process.env.COVENANT_TIMEOUT_MS ?? 15_000),
  };
}
