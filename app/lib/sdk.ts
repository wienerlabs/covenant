/**
 * Covenant TypeScript SDK.
 *
 * Thin, dependency-free wrapper around the public HTTP API. Useful
 * for:
 *   - Other agents that want to consume Covenant from Node / browser
 *   - Internal tooling (smoke tests, dashboards) that want types
 *     without spinning up Prisma
 *   - Bots calling Covenant from environments where you don't want
 *     to ship Anchor / Solana web3 dependencies
 *
 * The SDK does NOT handle wallet signing — for on-chain flows
 * (create_job, accept_job, etc.) the caller is responsible for
 * producing the signature via the wallet stack of their choice
 * and passing the resulting tx hash through these helpers.
 *
 * Usage:
 *
 *   import { CovenantClient } from "@/lib/sdk";
 *   const cv = new CovenantClient({ baseUrl: "https://covenant.run" });
 *
 *   const health = await cv.health();
 *   const { jobs } = await cv.listJobs({ status: "Open" });
 *   const exists = await cv.lookupJob({ posterWallet, specHash });
 *
 *   const created = await cv.createJob({
 *     posterWallet, amount, minWords, deadline, createdAt,
 *     escrowTxHash, // signed on-chain create_job tx hash
 *   });
 */

// ---------- Public types (mirror OpenAPI schemas) ----------

export type JobStatus =
  | "Open"
  | "Accepted"
  | "Delivered"
  | "Finalized"
  | "Disputed"
  | "Resolved"
  | "Cancelled";

export type PaymentToken = "USDC" | "SOL";

export interface Job {
  id: string;
  posterWallet: string;
  takerWallet: string | null;
  amount: number;
  specHash: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  specJson: Record<string, any>;
  minWords: number;
  category: string;
  paymentToken: PaymentToken;
  language: string;
  deadline: string;
  status: JobStatus;
  txHash: string | null;
  pda: string | null;
  escrowAta: string | null;
  createdAt: string;
}

export interface ClaimListing {
  id: string;
  pda: string;
  jobId: string;
  sellerWallet: string;
  buyerWallet: string | null;
  price: number;
  faceValue: number;
  status: "Listed" | "Bought" | "Cancelled" | "Settled";
}

export interface EloRow {
  agentWallet: string;
  agentName: string;
  elo: number;
  wins: number;
  losses: number;
  peakElo: number;
  avatarUrl: string | null;
  isCustom: boolean;
  isDefault: boolean;
}

export interface HealthResult {
  ok: boolean;
  timestamp: string;
  cluster: string;
  duration_ms: number;
  commit: string | null;
  region: string | null;
  checks: Record<string, { ok: boolean; detail?: string }>;
}

export interface VersionInfo {
  name: string;
  cluster: string;
  commit: string | null;
  commit_short: string | null;
  branch: string | null;
  repo: string | null;
  deploy_url: string | null;
  region: string | null;
  deploy_env: string | null;
  built_at: string;
  runtime: string;
}

export type ApiErrorCode =
  | "invalid_input"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "db_unavailable"
  | "rpc_unavailable"
  | "wallet_signature_failed"
  | "internal_error";

export class CovenantError extends Error {
  code: ApiErrorCode;
  status: number;
  details?: Record<string, unknown>;
  request_id?: string;

  constructor(args: {
    code: ApiErrorCode;
    message: string;
    status: number;
    details?: Record<string, unknown>;
    request_id?: string;
  }) {
    super(args.message);
    this.name = "CovenantError";
    this.code = args.code;
    this.status = args.status;
    this.details = args.details;
    this.request_id = args.request_id;
  }
}

// ---------- Client ----------

export interface CovenantClientOptions {
  /** Base URL. Defaults to https://covenant.run */
  baseUrl?: string;
  /** Optional fetch override (e.g. to attach auth in tests). */
  fetch?: typeof globalThis.fetch;
  /** Per-request timeout in ms. Defaults to 30s (matches Neon cold start budget). */
  timeoutMs?: number;
  /** Optional Bearer token for admin endpoints. */
  adminSecret?: string;
}

interface RequestOptions {
  method?: "GET" | "POST" | "DELETE" | "PATCH" | "PUT";
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  /** Send the admin secret on this request. */
  admin?: boolean;
}

export class CovenantClient {
  private baseUrl: string;
  private fetcher: typeof globalThis.fetch;
  private timeoutMs: number;
  private adminSecret?: string;

  constructor(opts: CovenantClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? "https://covenant.run").replace(/\/$/, "");
    this.fetcher = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.adminSecret = opts.adminSecret;
  }

  private async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const url = new URL(this.baseUrl + path);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined && v !== null && v !== "") {
          url.searchParams.set(k, String(v));
        }
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(opts.headers ?? {}),
    };
    if (opts.admin && this.adminSecret) {
      headers.Authorization = `Bearer ${this.adminSecret}`;
    }

    let res: Response;
    try {
      res = await this.fetcher(url.toString(), {
        method: opts.method ?? "GET",
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: opts.signal ?? controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const requestId = res.headers.get("x-request-id") ?? undefined;

    let parsed: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        // Leave raw — surfaces as message on error.
      }
    }

    if (!res.ok) {
      const body = (parsed as Record<string, unknown>) ?? {};
      const errPayload = (body.error as Record<string, unknown>) ?? {};
      throw new CovenantError({
        code: (errPayload.code as ApiErrorCode) ?? "internal_error",
        message:
          (errPayload.message as string) ??
          (body.error as string | undefined) ??
          `HTTP ${res.status}`,
        status: res.status,
        details: errPayload.details as Record<string, unknown> | undefined,
        request_id: requestId,
      });
    }

    // Some routes use the new envelope { ok, data, ... }, others
    // return raw payloads. Unwrap envelope if present.
    if (
      parsed &&
      typeof parsed === "object" &&
      "ok" in parsed &&
      "data" in parsed &&
      (parsed as { ok: unknown }).ok === true
    ) {
      return (parsed as { data: T }).data;
    }
    return parsed as T;
  }

  // ---------- Meta ----------

  health(): Promise<HealthResult> {
    return this.request<HealthResult>("/api/health");
  }

  version(): Promise<VersionInfo> {
    return this.request<VersionInfo>("/api/version");
  }

  openapi(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("/api/openapi");
  }

  // ---------- Jobs ----------

  listJobs(query?: {
    status?: JobStatus;
    category?: string;
    wallet?: string;
    page?: number;
    limit?: number;
    sortBy?: "createdAt" | "amount" | "status" | "deadline";
    sortOrder?: "asc" | "desc";
  }): Promise<{ jobs: Job[]; total: number; page: number; limit: number; totalPages: number }> {
    return this.request("/api/jobs", { query });
  }

  getJob(id: string): Promise<Job> {
    return this.request<Job>(`/api/jobs/${encodeURIComponent(id)}`);
  }

  lookupJob(args: {
    posterWallet: string;
    specHash: string;
  }): Promise<{ exists: boolean; job?: Partial<Job> }> {
    return this.request("/api/jobs/lookup", { method: "POST", body: args });
  }

  /**
   * Create a job after invoking on-chain create_job. The browser
   * (or a bot with @covenant/anchor-browser) is responsible for
   * producing `escrowTxHash` first.
   */
  createJob(args: {
    posterWallet: string;
    amount: number;
    minWords: number;
    language?: string;
    deadline: string;
    createdAt: string;
    category?: string;
    paymentToken?: PaymentToken;
    title?: string;
    description?: string;
    requirements?: string;
    escrowTxHash: string;
    escrowAta?: string;
  }): Promise<Job> {
    return this.request<Job>("/api/jobs", { method: "POST", body: args });
  }

  acceptJob(id: string, args: { takerWallet: string; onChainSig?: string }): Promise<unknown> {
    return this.request(`/api/jobs/${encodeURIComponent(id)}/accept`, {
      method: "POST",
      body: args,
    });
  }

  submitWork(
    id: string,
    args: {
      takerWallet: string;
      text?: string;
      outputText?: string;
      workHash: string;
      deliveryUri?: string;
      commitmentTxHash?: string;
    },
  ): Promise<unknown> {
    return this.request(`/api/jobs/${encodeURIComponent(id)}/submit`, {
      method: "POST",
      body: args,
    });
  }

  finalize(
    id: string,
    args: { callerWallet: string; onChainSig?: string },
  ): Promise<unknown> {
    return this.request(`/api/jobs/${encodeURIComponent(id)}/finalize`, {
      method: "POST",
      body: args,
    });
  }

  // ---------- Credit ----------

  listClaims(): Promise<{
    listings: ClaimListing[];
    totals: {
      listed: number;
      activeTvl: number;
      boughtCount: number;
      settledCount: number;
    };
  }> {
    return this.request("/api/claims");
  }

  // ---------- Reputation ----------

  eloLeaderboard(): Promise<EloRow[]> {
    return this.request<EloRow[]>("/api/elo/leaderboard");
  }
}
