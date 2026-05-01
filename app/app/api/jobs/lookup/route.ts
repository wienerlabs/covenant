import { NextRequest } from "next/server";
import { prisma, retryable, ensureSchema } from "@/lib/prisma";
import { ok, fail, failFromError } from "@/lib/api-response";
import { parseAndValidate } from "@/lib/validate";
import { log, timed } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/jobs/lookup
 *
 * Idempotency / pre-flight helper. The browser computes the spec
 * hash before invoking on-chain create_job; if a job with the same
 * (posterWallet, specHash) already exists the user almost certainly
 * does NOT want to broadcast another create_job tx (which would
 * fail anyway because the JobEscrow PDA is already initialized).
 *
 * Body: { posterWallet, specHash } — both required.
 * Returns: { exists, job? } — when exists=true, includes the
 *          existing job summary so the UI can offer "view existing"
 *          instead of forcing a duplicate.
 *
 * This route is the canonical reference implementation of the new
 * envelope + validate + logger stack. Other routes will be migrated
 * to this pattern incrementally.
 */
export async function POST(request: NextRequest) {
  const reqLog = log.forRequest(request);
  const requestId =
    request.headers.get("x-request-id") ?? undefined;

  await ensureSchema().catch(() => {
    /* non-fatal — surfaced by /api/health */
  });

  const validation = await parseAndValidate<{
    posterWallet: string;
    specHash: string;
  }>(request, {
    posterWallet: { type: "solanaPubkey", required: true },
    specHash: {
      type: "hexString",
      required: true,
      hexLength: 32,
    },
  });

  if (!validation.ok) {
    reqLog.warn("invalid lookup body", { issues: validation.issues });
    return fail("invalid_input", "Validation failed.", {
      details: { issues: validation.issues },
      request_id: requestId,
    });
  }

  const { posterWallet, specHash } = validation.data;

  try {
    const existing = await timed(
      reqLog.child({ component: "prisma" }),
      "job.findFirst",
      () =>
        retryable(() =>
          prisma.job.findFirst({
            where: { posterWallet, specHash },
            select: {
              id: true,
              status: true,
              amount: true,
              category: true,
              deadline: true,
              createdAt: true,
              pda: true,
              txHash: true,
            },
          }),
        ),
      { posterWallet, specHash: specHash.slice(0, 12) },
    );

    if (!existing) {
      return ok(
        { exists: false },
        { request_id: requestId },
      );
    }

    return ok(
      {
        exists: true,
        job: existing,
      },
      { request_id: requestId },
    );
  } catch (err) {
    reqLog.error("lookup failed", err, { posterWallet });
    return failFromError(err);
  }
}
