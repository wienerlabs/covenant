import { NextRequest } from "next/server";
import {
  readErrorBuffer,
  bufferStats,
  clearErrorBuffer,
} from "@/lib/error-buffer";
import { ok, fail } from "@/lib/api-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/error-buffer
 *
 * Returns the most recent error/fatal log lines captured by the
 * structured logger's in-memory ring buffer (newest first). Caps
 * at the last 100 entries per serverless function instance.
 *
 * DELETE /api/admin/error-buffer
 *
 * Clears the buffer. Useful after acknowledging an issue so the
 * next failure stands out.
 *
 * Auth: Bearer ADMIN_SECRET (or CRON_SECRET as fallback).
 */

function authorized(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET || process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return fail("unauthorized", "Bearer admin secret required.");
  const limit = Math.min(
    Number(new URL(req.url).searchParams.get("limit") ?? 100),
    100,
  );
  const all = readErrorBuffer();
  return ok(
    {
      stats: bufferStats(),
      entries: all.slice(0, limit),
    },
    {
      meta: {
        note: "In-memory ring buffer — only contains errors from THIS serverless instance.",
        instance_started: new Date().toISOString(),
      },
    },
  );
}

export async function DELETE(req: NextRequest) {
  if (!authorized(req)) return fail("unauthorized", "Bearer admin secret required.");
  const cleared = clearErrorBuffer();
  return ok({ cleared });
}
