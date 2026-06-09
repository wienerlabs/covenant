/**
 * C-115 — database quota guardrail.
 *
 * Probes the live Postgres database size and warns (logs + optional alert)
 * BEFORE the Neon storage quota is hit, so the quota incident "cannot recur
 * silently". **Opt-in**: without `DB_QUOTA_LIMIT_BYTES` the check is a no-op.
 *
 * The ratio/level math is pure (unit-tested); the size probe and the alert are
 * injectable, so the decision logic is testable without a real DB or webhook.
 *
 * Env:
 *   DB_QUOTA_LIMIT_BYTES   the Neon plan's storage limit in bytes (required to arm)
 *   DB_QUOTA_WARN_RATIO    warn at this fraction of the limit (default 0.80)
 *   DB_QUOTA_CRIT_RATIO    critical at this fraction (default 0.95)
 */

import { alertDbQuota } from "@/lib/alerts";

export type QuotaLevel = "ok" | "warn" | "critical";

/** used/limit, clamped to >= 0; 0 when the limit is unknown (<= 0). Pure. */
export function quotaUsageRatio(usedBytes: number, limitBytes: number): number {
  if (!Number.isFinite(usedBytes) || !Number.isFinite(limitBytes) || limitBytes <= 0) return 0;
  return Math.max(0, usedBytes / limitBytes);
}

/** Map a usage ratio to a level given the warn/critical thresholds. Pure. */
export function quotaLevel(ratio: number, warnRatio: number, critRatio: number): QuotaLevel {
  if (ratio >= critRatio) return "critical";
  if (ratio >= warnRatio) return "warn";
  return "ok";
}

export interface DbQuotaConfig {
  limitBytes: number;
  warnRatio: number;
  critRatio: number;
}

function clampRatio(v: number, fallback: number): number {
  return Number.isFinite(v) && v > 0 && v <= 1 ? v : fallback;
}

/**
 * Build config from env. Returns `null` when `DB_QUOTA_LIMIT_BYTES` is unset or
 * invalid — that is the opt-in switch (no limit → the guardrail is a no-op).
 */
export function dbQuotaConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): DbQuotaConfig | null {
  const limitBytes = Number(env.DB_QUOTA_LIMIT_BYTES);
  if (!Number.isFinite(limitBytes) || limitBytes <= 0) return null;
  return {
    limitBytes,
    warnRatio: clampRatio(Number(env.DB_QUOTA_WARN_RATIO), 0.8),
    critRatio: clampRatio(Number(env.DB_QUOTA_CRIT_RATIO), 0.95),
  };
}

export interface DbQuotaResult {
  configured: boolean;
  usedBytes: number;
  limitBytes: number;
  ratio: number;
  level: QuotaLevel;
  alerted: boolean;
}

export interface CheckDbQuotaDeps {
  /** Probe that returns the current DB size in bytes. */
  getSizeBytes: () => Promise<number>;
  /** Override config (else read from env). */
  config?: DbQuotaConfig | null;
  /** Override the alert sink (else alertDbQuota). */
  alert?: (metric: string, value: number, threshold: number) => Promise<boolean>;
  /** Optional observer (e.g. structured log) — always called when configured. */
  onResult?: (result: DbQuotaResult) => void;
}

const UNCONFIGURED: DbQuotaResult = {
  configured: false,
  usedBytes: 0,
  limitBytes: 0,
  ratio: 0,
  level: "ok",
  alerted: false,
};

/**
 * Probe DB size, compute the level, and fire `alertDbQuota` when at or above
 * the warn threshold. No-op (`configured:false`) when no limit is set. Never
 * throws — a guardrail must not itself break the cron that runs it.
 *
 * Alert cadence: this fires on every over-threshold run, so the caller (the
 * cron) supplies the rate limit — schedule it e.g. hourly and you get at most
 * one alert per hour while over quota.
 */
export async function checkDbQuota(deps: CheckDbQuotaDeps): Promise<DbQuotaResult> {
  const config = deps.config ?? dbQuotaConfigFromEnv();
  if (!config) return UNCONFIGURED;

  let usedBytes = 0;
  try {
    usedBytes = await deps.getSizeBytes();
  } catch {
    usedBytes = 0; // probe failure → treat as 0 (ok); never throw
  }

  const ratio = quotaUsageRatio(usedBytes, config.limitBytes);
  const level = quotaLevel(ratio, config.warnRatio, config.critRatio);

  let alerted = false;
  if (level !== "ok") {
    const alert = deps.alert ?? alertDbQuota;
    alerted = await alert("db_size_bytes", usedBytes, config.limitBytes).catch(() => false);
  }

  const result: DbQuotaResult = {
    configured: true,
    usedBytes,
    limitBytes: config.limitBytes,
    ratio: Math.round(ratio * 10000) / 10000,
    level,
    alerted,
  };
  deps.onResult?.(result);
  return result;
}

/** `SELECT pg_database_size(current_database())` via the given Prisma client. */
export async function getDbSizeBytes(client: {
  $queryRaw: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
}): Promise<number> {
  const rows = await client.$queryRaw<Array<{ size: bigint | number | string }>>`
    SELECT pg_database_size(current_database()) AS size
  `;
  const size = rows?.[0]?.size;
  return typeof size === "bigint" ? Number(size) : Number(size ?? 0);
}
