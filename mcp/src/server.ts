#!/usr/bin/env node
/**
 * covenant-mcp — Model Context Protocol server for Covenant.
 *
 * Covenant is the agent-to-agent settlement layer on Solana.
 * x402 powers paid access. Covenant powers paid work.
 *
 * This server exposes Covenant to any MCP-speaking agent (Claude Desktop,
 * Claude Code, Cursor, an autonomous loop). v0.1 ships the read-only
 * discovery surface, which needs no wallet and no credentials: find open
 * work, inspect a job's settlement state, read reputation, discover
 * counterparties, and check live protocol stats.
 *
 * The write surface (create_escrow / accept_job / deliver / release /
 * dispute / factor_claim) lands next; it activates when the server is
 * started with COVENANT_AGENT_KEYPAIR set, so an autonomous agent is its
 * own non-custodial wallet.
 *
 * Transport: stdio. Configure in your MCP client (see README).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { registerDiscoveryTools } from "./tools/discover.js";

async function main(): Promise<void> {
  const config = loadConfig();

  const server = new McpServer({
    name: "covenant-mcp",
    version: "0.1.0",
  });

  // v0.1: read-only discovery tools (no wallet required).
  registerDiscoveryTools(server, config);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stderr is safe to log to under stdio transport; stdout is the
  // JSON-RPC channel and must not be polluted.
  process.stderr.write(
    `covenant-mcp v0.1.0 connected. network=${config.network} api=${config.baseUrl}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(
    `covenant-mcp fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
  );
  process.exit(1);
});
