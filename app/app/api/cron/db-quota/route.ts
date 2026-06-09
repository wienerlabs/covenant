import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { constantTimeEqual } from "@/lib/secure-compare";
import { log } from "@/lib/logger";
import { checkDbQuota, getDbSizeBytes } from "@/lib/db-quota";

// Always dynamic — talks to Prisma per request; never pre-render at build.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/cron/db-quota
 *
 * C-115 — DB quota guardrail. Probes `pg_database_size(current_database())` and,
 * when usage crosses the warn/critical fraction of `DB_QUOTA_LIMIT_BYTES`, fires
 * `alertDbQuota` so the Neon quota cannot fill up silently. The size + level are
 * always logged (structured), so it is observable even without a webhook.
 *
 * No-op until `DB_QUOTA_LIMIT_BYTES` is set (opt-in). The cron cadence IS the
 * alert rate-limit: schedule it hourly → at most one alert per hour over quota.
 *
 * Schedule in vercel.json:
 *   { "crons": [{ "path": "/api/cron/db-quota", "schedule": "0 * * * *" }] }
 */

const CRON_SECRET = process.env.CRON_SECRET ?? "";

function authorized(req: NextRequest): boolean {
  // Header-only, constant-time, fail-closed — same posture as the other crons.
  if (!CRON_SECRET) return false;
  const header = req.headers.get("authorization") ?? "";
  return constantTimeEqual(header, `Bearer ${CRON_SECRET}`);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reqLog = log.forRequest(req);

  const result = await checkDbQuota({
    getSizeBytes: () => getDbSizeBytes(prisma),
    onResult: (r) =>
      reqLog.info("db quota check", {
        used_bytes: r.usedBytes,
        limit_bytes: r.limitBytes,
        ratio: r.ratio,
        level: r.level,
        alerted: r.alerted,
      }),
  });

  if (!result.configured) {
    reqLog.info("db quota check skipped: DB_QUOTA_LIMIT_BYTES unset");
  }

  return NextResponse.json(result, { status: 200 });
}
