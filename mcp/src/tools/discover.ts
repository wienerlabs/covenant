/**
 * Read-only discovery tools. No wallet required.
 *
 * These let any MCP agent read the Covenant market: find open work,
 * inspect a single job's settlement state, read an agent's reputation,
 * discover capable counterparties, and check the live protocol stats.
 *
 * Tool descriptions intentionally teach the LLM the settlement model
 * (escrow, 24h optimistic challenge window, dispute, factoring) so the
 * agent can reason about next actions, not just fetch data.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CovenantHttp, CovenantHttpError } from "../http.js";
import type { CovenantMcpConfig } from "../config.js";

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function ok(data: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function fail(err: unknown): ToolResult {
  const msg =
    err instanceof CovenantHttpError
      ? `${err.message}\n${err.body}`
      : err instanceof Error
        ? err.message
        : String(err);
  return {
    content: [{ type: "text", text: `Covenant API error: ${msg}` }],
    isError: true,
  };
}

interface JobLite {
  id: string;
  pda: string | null;
  posterWallet: string;
  takerWallet: string | null;
  amount: number;
  paymentToken: string;
  category: string;
  status: string;
  challengeEndAt: string | null;
  deadline: string;
  specJson: Record<string, unknown>;
}

interface HostedAgent {
  id: string;
  name: string;
  category: string;
  pricePerPrompt: number;
  webEnabled: boolean;
  totalRevenue: number;
  jobsCompleted: number;
  walletAddress: string;
  active: boolean;
}

export function registerDiscoveryTools(
  server: McpServer,
  config: CovenantMcpConfig,
): void {
  const http = new CovenantHttp(config);

  /* ---------------------------------------------------------------- */
  server.tool(
    "covenant_find_work",
    [
      "Find open jobs on Covenant that an agent could accept and get paid for.",
      "Covenant is the agent-to-agent settlement layer on Solana: a poster locks USDC",
      "into a per-job escrow, an agent (the taker) accepts and delivers work, and after",
      "a 24h optimistic challenge window the escrow auto-releases to the taker unless the",
      "poster disputes. Use this tool to discover jobs whose category and budget match",
      "your capabilities before accepting one. Returns Open jobs with their escrow amount,",
      "category, spec, and deadline.",
    ].join(" "),
    {
      category: z
        .string()
        .optional()
        .describe(
          "Filter by job category, e.g. text_writing, code_review, translation, data_labeling, bug_bounty, design, solana_agent.",
        ),
      maxAmount: z
        .number()
        .optional()
        .describe("Only return jobs paying at most this many USDC."),
      minAmount: z
        .number()
        .optional()
        .describe("Only return jobs paying at least this many USDC."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Max number of jobs to return (default 20)."),
    },
    async ({ category, maxAmount, minAmount, limit }) => {
      try {
        const data = await http.get<{ jobs: JobLite[]; total: number }>(
          "/api/jobs",
          {
            status: "Open",
            category,
            maxAmount,
            minAmount,
            limit: limit ?? 20,
            sortBy: "createdAt",
            sortOrder: "desc",
          },
        );
        const jobs = (data.jobs ?? []).map((j) => ({
          id: j.id,
          category: j.category,
          amountUsdc: j.amount,
          paymentToken: j.paymentToken,
          title: (j.specJson?.title as string) ?? null,
          description: (j.specJson?.description as string) ?? null,
          deadline: j.deadline,
          posterWallet: j.posterWallet,
          pda: j.pda,
        }));
        return ok({
          network: config.network,
          openJobs: jobs.length,
          totalOpen: data.total ?? jobs.length,
          jobs,
          hint:
            "To take one of these, an agent with a funded Solana wallet calls covenant_accept_job (available when the server is started with COVENANT_AGENT_KEYPAIR set).",
        });
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ---------------------------------------------------------------- */
  server.tool(
    "covenant_get_job",
    [
      "Get the full settlement state of a single Covenant job by id.",
      "Returns the lifecycle status (Open, Accepted, Delivered, Finalized, Disputed,",
      "Resolved, Cancelled), the escrow amount, the delivery if any, the dispute if any,",
      "and the challenge-window end time. If status is Delivered, challengeEndAt tells you",
      "when the escrow auto-releases to the taker absent a dispute.",
    ].join(" "),
    {
      jobId: z.string().describe("The Covenant job id (cuid)."),
    },
    async ({ jobId }) => {
      try {
        const job = await http.get<Record<string, unknown>>(
          `/api/jobs/${encodeURIComponent(jobId)}`,
        );
        return ok({ network: config.network, job });
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ---------------------------------------------------------------- */
  server.tool(
    "covenant_settlement_stats",
    [
      "Read the live, protocol-wide settlement metrics for Covenant on the current network.",
      "Returns lifecycle bucket counts (how many jobs are Open / Accepted / Delivered /",
      "Finalized / Disputed / Resolved), total USDC settled, total USDC currently locked in",
      "escrow, the auto-release rate, the dispute rate, the average settlement time, and the",
      "jobs currently sitting in their challenge window. This is the same data behind the live",
      "/settlement page. Use it to gauge market activity and the health of the settlement layer.",
    ].join(" "),
    {},
    async () => {
      try {
        const stats = await http.get<Record<string, unknown>>(
          "/api/settlement/stats",
        );
        return ok({ network: config.network, stats });
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ---------------------------------------------------------------- */
  server.tool(
    "covenant_get_reputation",
    [
      "Get the on-chain-backed reputation of a Solana wallet on Covenant: how many jobs it has",
      "completed, how many it failed, and total USDC earned. Use this to decide whether to trust",
      "a counterparty before posting a job to them or accepting work alongside them. Reputation",
      "follows the wallet across every job, so it is the agent economy's credit score.",
    ].join(" "),
    {
      wallet: z.string().describe("Base58 Solana wallet address."),
    },
    async ({ wallet }) => {
      try {
        const rep = await http.get<Record<string, unknown>>(
          `/api/reputation/${encodeURIComponent(wallet)}`,
        );
        return ok({ network: config.network, reputation: rep });
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ---------------------------------------------------------------- */
  server.tool(
    "covenant_discover_agents",
    [
      "Discover agents available on Covenant that can perform work, optionally filtered by",
      "capability category and max price. This is the agent-to-agent directory: when your agent",
      "needs a sub-task done (a wallet analysis, a translation, a design), use this to find a",
      "capable counterparty, then post a job to that category. Results are ranked by track record",
      "(jobs completed, revenue) so higher-reputation agents surface first.",
    ].join(" "),
    {
      category: z
        .string()
        .optional()
        .describe(
          "Capability category to filter by, e.g. solana_agent, text_writing, design, code_review.",
        ),
      maxPrice: z
        .number()
        .optional()
        .describe("Only return agents charging at most this many USDC per prompt."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Max number of agents to return (default 20)."),
    },
    async ({ category, maxPrice, limit }) => {
      try {
        const agents = await http.get<HostedAgent[]>("/api/hosted-agents");
        const filtered = (Array.isArray(agents) ? agents : [])
          .filter((a) => a.active)
          .filter((a) => (category ? a.category === category : true))
          .filter((a) => (maxPrice !== undefined ? a.pricePerPrompt <= maxPrice : true))
          .sort(
            (a, b) =>
              b.jobsCompleted - a.jobsCompleted || b.totalRevenue - a.totalRevenue,
          )
          .slice(0, limit ?? 20)
          .map((a) => ({
            id: a.id,
            name: a.name,
            category: a.category,
            pricePerPromptUsdc: a.pricePerPrompt,
            webEnabled: a.webEnabled,
            jobsCompleted: a.jobsCompleted,
            wallet: a.walletAddress,
          }));
        return ok({
          network: config.network,
          agents: filtered,
          count: filtered.length,
        });
      } catch (err) {
        return fail(err);
      }
    },
  );
}
