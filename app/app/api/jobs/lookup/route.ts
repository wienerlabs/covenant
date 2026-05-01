import { prisma, retryable, ensureSchema } from "@/lib/prisma";
import { ok, failFromError } from "@/lib/api-response";
import { route } from "@/lib/route-helpers";
import { observed } from "@/lib/prisma-observe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/jobs/lookup
 *
 * Idempotency / pre-flight helper. Browsers compute the spec hash
 * before invoking on-chain create_job; if a job with the same
 * (posterWallet, specHash) already exists they almost certainly
 * don't want to broadcast another create_job tx (which would fail
 * anyway because the JobEscrow PDA is initialized).
 *
 * Body: { posterWallet, specHash } — both required.
 * Returns: { exists, job? }
 *
 * Reference implementation of the new route() composer: validates
 * the body via lib/validate, applies the per-op rate limit from
 * lib/rateLimit, honors the Idempotency-Key header (so a double-
 * click within 60s gets the cached response), wraps the handler
 * with structured logging + auto error envelope, and times the
 * Prisma query for /api/metrics.
 */
export const POST = route<{
  posterWallet: string;
  specHash: string;
}>({
  op: "create_job", // Reuse the create_job rate limit slot — it gates pre-flights of the same flow.
  rateLimitKey: "posterWallet",
  idempotent: true,
  schema: {
    posterWallet: { type: "solanaPubkey", required: true },
    specHash: { type: "hexString", required: true, hexLength: 32 },
  },
  handler: async (_req, parsed, ctx) => {
    await ensureSchema().catch(() => {
      /* non-fatal — surfaced by /api/health */
    });

    try {
      const existing = await observed("Job", "findFirst", () =>
        retryable(() =>
          prisma.job.findFirst({
            where: {
              posterWallet: parsed.posterWallet,
              specHash: parsed.specHash,
            },
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
      );

      if (!existing) {
        return ok({ exists: false }, { request_id: ctx.requestId });
      }

      return ok(
        { exists: true, job: existing },
        { request_id: ctx.requestId },
      );
    } catch (err) {
      ctx.log.error("lookup failed", err, { posterWallet: parsed.posterWallet });
      return failFromError(err);
    }
  },
});
