/**
 * Admin endpoint authentication + audit logging (C-095).
 *
 * Admin routes are **fail-closed**: if no admin secret is configured the
 * request is denied, never accepted. Every authorized admin action is
 * recorded in the durable `AdminAuditLog` table; denied attempts are logged
 * to the structured logger (and surface in the error buffer) without a DB
 * write so a flood of bad credentials can't amplify into DB load.
 */

import { constantTimeEqual } from "./secure-compare";

/** The admin bearer secret: `ADMIN_SECRET`, falling back to `CRON_SECRET`. */
export function adminSecret(): string | undefined {
  return process.env.ADMIN_SECRET || process.env.CRON_SECRET || undefined;
}

export interface AdminAuthResult {
  ok: boolean;
  reason?: string;
}

/**
 * Verify a request carries the admin bearer secret. Pure + synchronous —
 * fail-closed when no secret is configured, constant-time comparison so the
 * secret can't be recovered from response timing.
 */
export function requireAdmin(req: Request): AdminAuthResult {
  const secret = adminSecret();
  if (!secret) return { ok: false, reason: "admin secret not configured" };
  const auth = req.headers.get("authorization") ?? "";
  if (constantTimeEqual(auth, `Bearer ${secret}`)) return { ok: true };
  return { ok: false, reason: "invalid admin credentials" };
}

/** Best-effort client IP for audit logging. */
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** Best-effort durable audit record of an authorized admin action. */
export async function logAdminAction(entry: {
  action: string;
  method: string;
  route: string;
  ip?: string | null;
  authorized: boolean;
  detail?: string;
}): Promise<void> {
  try {
    const { prisma, retryable } = await import("./prisma");
    await retryable(() =>
      prisma.adminAuditLog.create({
        data: {
          action: entry.action,
          method: entry.method,
          route: entry.route,
          ip: entry.ip ?? null,
          authorized: entry.authorized,
          detail: entry.detail ?? null,
        },
      }),
    );
  } catch (err) {
    console.error("[admin] audit log write failed:", err);
  }
}

/**
 * Guard an admin route: verify the secret, record the outcome, and return
 * the auth result. Authorized actions are persisted to `AdminAuditLog`;
 * denied attempts are logged to the console only.
 *
 *   const auth = await guardAdmin(req, "admin.db-stats.read");
 *   if (!auth.ok) return fail("unauthorized", ...);
 */
export async function guardAdmin(
  req: Request,
  action: string,
): Promise<AdminAuthResult> {
  const auth = requireAdmin(req);
  const ip = clientIp(req);
  const route = (() => {
    try {
      return new URL(req.url).pathname;
    } catch {
      return action;
    }
  })();

  if (auth.ok) {
    await logAdminAction({
      action,
      method: req.method,
      route,
      ip,
      authorized: true,
    });
  } else {
    console.warn(
      `[admin] denied ${req.method} ${route} from ${ip}: ${auth.reason}`,
    );
  }
  return auth;
}
