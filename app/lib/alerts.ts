/**
 * C-112 — operational alerting.
 *
 * Fires alerts to a configurable webhook (Slack / Discord / any JSON endpoint)
 * for the conditions that need a human: crank failures, RPC outages, DB-quota
 * pressure, dispute spikes. It is **non-breaking and opt-in** — when
 * `ALERT_WEBHOOK_URL` is unset, `sendAlert` is a no-op, and it NEVER throws into
 * its caller (a settlement path must not fail because alerting is down).
 *
 * The formatting is pure and the `fetch` is injectable, so the payload + the
 * no-op / swallow-error behaviour are unit-testable without a real webhook.
 */

export type AlertSeverity = "info" | "warning" | "critical";

export interface Alert {
  severity: AlertSeverity;
  /** Short, stable title (used for grouping/dedup downstream). */
  title: string;
  /** Optional human detail. */
  detail?: string;
  /** Optional structured fields (jobId, endpoint, count, …). */
  fields?: Record<string, string | number | boolean | null | undefined>;
}

const EMOJI: Record<AlertSeverity, string> = {
  info: "ℹ️",
  warning: "⚠️",
  critical: "🚨",
};

/**
 * Render an alert into a Slack/Discord-compatible `{ text }` payload (both
 * accept a top-level `text` field). Pure.
 */
export function formatAlert(alert: Alert, opts?: { service?: string }): { text: string } {
  const service = opts?.service ?? "covenant";
  const head = `${EMOJI[alert.severity]} [${alert.severity.toUpperCase()}] ${service}: ${alert.title}`;
  const lines = [head];
  if (alert.detail) lines.push(alert.detail);
  if (alert.fields) {
    const kv = Object.entries(alert.fields)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `${k}=${v}`);
    if (kv.length) lines.push(kv.join("  "));
  }
  return { text: lines.join("\n") };
}

export interface SendAlertDeps {
  /** Override the webhook URL (else ALERT_WEBHOOK_URL). */
  webhookUrl?: string;
  /** Override fetch (for tests). */
  fetch?: typeof globalThis.fetch;
}

/**
 * Post an alert to the configured webhook. Returns `true` if delivered, `false`
 * if skipped (unconfigured) or on any error — it never throws.
 */
export async function sendAlert(alert: Alert, deps?: SendAlertDeps): Promise<boolean> {
  const url = deps?.webhookUrl ?? process.env.ALERT_WEBHOOK_URL;
  if (!url) return false; // opt-in: no webhook → no-op

  const doFetch = deps?.fetch ?? globalThis.fetch.bind(globalThis);
  try {
    const res = await doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formatAlert(alert)),
    });
    return res.ok;
  } catch (err) {
    // Alerting must never break the caller. Log to stderr and move on.
    // eslint-disable-next-line no-console
    console.error("[alerts] failed to deliver alert:", err instanceof Error ? err.message : err);
    return false;
  }
}

// ---- Condition helpers (the C-112 alert set) ----

/** A finalize/crank attempt failed for a job. */
export function alertCrankFailure(jobId: string, error: string, deps?: SendAlertDeps): Promise<boolean> {
  return sendAlert(
    { severity: "critical", title: "crank: finalize failed", detail: error, fields: { jobId } },
    deps,
  );
}

/** RPC failover exhausted every endpoint. */
export function alertRpcDown(endpoints: number, lastError: string, deps?: SendAlertDeps): Promise<boolean> {
  return sendAlert(
    { severity: "critical", title: "rpc: all endpoints failing", detail: lastError, fields: { endpoints } },
    deps,
  );
}

/** Database is approaching/over a usage threshold (rows, storage, connections). */
export function alertDbQuota(metric: string, value: number, threshold: number, deps?: SendAlertDeps): Promise<boolean> {
  return sendAlert(
    { severity: "warning", title: "db: quota pressure", fields: { metric, value, threshold } },
    deps,
  );
}

/** Disputes opened in a window exceeded the expected rate. */
export function alertDisputeSpike(count: number, windowMin: number, deps?: SendAlertDeps): Promise<boolean> {
  return sendAlert(
    { severity: "warning", title: "disputes: spike detected", fields: { count, windowMin } },
    deps,
  );
}
