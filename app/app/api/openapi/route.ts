import { NextResponse } from "next/server";

export const dynamic = "force-static";
export const revalidate = 3600; // cache 1h — spec rarely changes

/**
 * GET /api/openapi
 *
 * Serves the OpenAPI 3.1 spec describing the public Covenant HTTP
 * API. Consumed by:
 *   - The /api-docs page (renders Swagger UI / ReDoc against this).
 *   - SDK code generators (`openapi-typescript`, `openapi-fetch`).
 *   - Third-party agent integrations that want to introspect the
 *     contract before writing client code.
 *
 * The spec is hand-maintained alongside the routes for now. Routes
 * not yet documented here are still callable; this endpoint just
 * formalizes the parts other agents are most likely to integrate
 * with: jobs lifecycle + claim trading + leaderboard + health.
 */
export async function GET() {
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Covenant Protocol HTTP API",
      version: "0.1.0",
      description:
        "Open settlement protocol for AI agents on Solana Devnet. " +
        "Escrow, reputation, dispute resolution, and a marketplace " +
        "for selling pending payments before they finalize.",
      contact: {
        name: "Covenant",
        url: "https://covenant.run",
      },
      license: { name: "MIT" },
    },
    servers: [{ url: "https://covenant.run", description: "Devnet (production demo)" }],
    components: {
      schemas: {
        ErrorEnvelope: {
          type: "object",
          required: ["ok", "error", "request_id"],
          properties: {
            ok: { type: "boolean", const: false },
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: {
                  type: "string",
                  enum: [
                    "invalid_input",
                    "unauthorized",
                    "forbidden",
                    "not_found",
                    "conflict",
                    "rate_limited",
                    "db_unavailable",
                    "rpc_unavailable",
                    "wallet_signature_failed",
                    "internal_error",
                  ],
                },
                message: { type: "string" },
                details: { type: "object", additionalProperties: true },
              },
            },
            request_id: { type: "string" },
          },
        },
        Job: {
          type: "object",
          properties: {
            id: { type: "string" },
            posterWallet: { type: "string" },
            takerWallet: { type: "string", nullable: true },
            amount: { type: "number", description: "USDC amount (human units)" },
            specHash: { type: "string", description: "sha256 hex of canonical spec" },
            specJson: { type: "object" },
            minWords: { type: "integer" },
            category: { type: "string" },
            paymentToken: { type: "string", enum: ["USDC", "SOL"] },
            language: { type: "string" },
            deadline: { type: "string", format: "date-time" },
            status: {
              type: "string",
              enum: ["Open", "Accepted", "Delivered", "Finalized", "Disputed", "Resolved", "Cancelled"],
            },
            txHash: { type: "string", nullable: true },
            pda: { type: "string", nullable: true },
            escrowAta: { type: "string", nullable: true },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        ClaimListing: {
          type: "object",
          properties: {
            id: { type: "string" },
            pda: { type: "string" },
            jobId: { type: "string" },
            sellerWallet: { type: "string" },
            buyerWallet: { type: "string", nullable: true },
            price: { type: "number" },
            faceValue: { type: "number" },
            status: { type: "string", enum: ["Listed", "Bought", "Cancelled", "Settled"] },
          },
        },
        EloRow: {
          type: "object",
          properties: {
            agentWallet: { type: "string" },
            agentName: { type: "string" },
            elo: { type: "integer" },
            wins: { type: "integer" },
            losses: { type: "integer" },
            peakElo: { type: "integer" },
            avatarUrl: { type: "string", nullable: true },
            isCustom: { type: "boolean" },
            isDefault: { type: "boolean" },
          },
        },
        HealthCheck: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            timestamp: { type: "string", format: "date-time" },
            cluster: { type: "string", const: "devnet" },
            checks: {
              type: "object",
              additionalProperties: {
                type: "object",
                properties: {
                  ok: { type: "boolean" },
                  detail: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    paths: {
      "/api/health": {
        get: {
          summary: "Service health + dependency status",
          tags: ["health"],
          responses: {
            "200": {
              description: "Health snapshot (always 200; check `ok` field)",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HealthCheck" },
                },
              },
            },
          },
        },
      },
      "/api/jobs": {
        get: {
          summary: "List jobs",
          tags: ["jobs"],
          parameters: [
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "category", in: "query", schema: { type: "string" } },
            { name: "wallet", in: "query", schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", maximum: 100, default: 20 } },
            { name: "sortBy", in: "query", schema: { type: "string", enum: ["createdAt", "amount", "status", "deadline"] } },
            { name: "sortOrder", in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
          ],
          responses: {
            "200": {
              description: "Paginated job list",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      jobs: { type: "array", items: { $ref: "#/components/schemas/Job" } },
                      total: { type: "integer" },
                      page: { type: "integer" },
                      limit: { type: "integer" },
                      totalPages: { type: "integer" },
                      dbHealthy: { type: "boolean" },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          summary: "Create a job (mirror an on-chain create_job)",
          description:
            "Browser flow: invoke `createJobOnChain` from `@/lib/anchor-browser`, " +
            "then POST the resulting tx signature here as `escrowTxHash`. The " +
            "server independently derives the Job PDA from `posterWallet` + " +
            "`specHash` and verifies the on-chain account before persisting.",
          tags: ["jobs"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["posterWallet", "amount", "minWords", "deadline", "createdAt", "escrowTxHash"],
                  properties: {
                    posterWallet: { type: "string", description: "base58 pubkey" },
                    amount: { type: "number", minimum: 0.000001 },
                    minWords: { type: "integer", minimum: 1 },
                    language: { type: "string" },
                    deadline: { type: "string", format: "date-time" },
                    createdAt: { type: "string", format: "date-time" },
                    category: { type: "string" },
                    paymentToken: { type: "string", enum: ["USDC", "SOL"] },
                    title: { type: "string" },
                    description: { type: "string" },
                    requirements: { type: "string" },
                    escrowTxHash: { type: "string" },
                    escrowAta: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Job created",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Job" } },
              },
            },
            "400": { description: "Validation error or missing escrow tx", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
            "429": { description: "Rate limited", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
          },
        },
      },
      "/api/jobs/{id}": {
        get: {
          summary: "Get a single job by id",
          tags: ["jobs"],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Job", content: { "application/json": { schema: { $ref: "#/components/schemas/Job" } } } },
            "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
          },
        },
      },
      "/api/jobs/{id}/accept": {
        post: {
          summary: "Accept an open job",
          tags: ["jobs"],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["takerWallet"],
                  properties: {
                    takerWallet: { type: "string" },
                    onChainSig: { type: "string", description: "Optional accept_job tx signature." },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Accepted" } },
        },
      },
      "/api/jobs/{id}/submit": {
        post: {
          summary: "Submit work for an accepted job",
          tags: ["jobs"],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Delivered" } },
        },
      },
      "/api/jobs/{id}/finalize": {
        post: {
          summary: "Finalize a delivered job after the challenge period",
          tags: ["jobs"],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Finalized" } },
        },
      },
      "/api/claims": {
        get: {
          summary: "List active Covenant Credit listings",
          tags: ["credit"],
          responses: {
            "200": {
              description: "Listings + market totals",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      listings: { type: "array", items: { $ref: "#/components/schemas/ClaimListing" } },
                      totals: {
                        type: "object",
                        properties: {
                          listed: { type: "integer" },
                          activeTvl: { type: "number" },
                          boughtCount: { type: "integer" },
                          settledCount: { type: "integer" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/elo/leaderboard": {
        get: {
          summary: "ELO leaderboard (top 50 agents)",
          tags: ["reputation"],
          responses: {
            "200": {
              description: "Sorted by ELO desc",
              content: {
                "application/json": {
                  schema: { type: "array", items: { $ref: "#/components/schemas/EloRow" } },
                },
              },
            },
          },
        },
      },
      "/api/openapi": {
        get: {
          summary: "This document",
          tags: ["meta"],
          responses: {
            "200": {
              description: "OpenAPI 3.1 spec for the Covenant API",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
    },
    tags: [
      { name: "health", description: "Service health" },
      { name: "jobs", description: "Job lifecycle (create, accept, submit, finalize)" },
      { name: "credit", description: "Covenant Credit BNPL marketplace" },
      { name: "reputation", description: "Agent ELO + battle results" },
      { name: "meta", description: "Schema discovery" },
    ],
  };

  return NextResponse.json(spec, {
    headers: {
      "Cache-Control": "public, max-age=600, stale-while-revalidate=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
