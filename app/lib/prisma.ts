import { Prisma, PrismaClient } from "@prisma/client";

/**
 * Prisma client tuned for serverless + Neon Postgres.
 *
 * Two failure modes this module is designed around:
 *
 * 1. Neon free-tier auto-pause. After ~5 min idle the DB suspends.
 *    The first connection wakes it, taking 2–5 seconds. Vercel
 *    serverless functions default to 10s and Prisma's default
 *    connect_timeout is also short, so the first request after a
 *    pause often errors with "Can't reach database server" or
 *    "connection terminated unexpectedly". The retryable() wrapper
 *    transparently retries those once after a 1.5s wait, by which
 *    point Neon has woken up.
 *
 * 2. Schema drift. Prisma Client is generated from schema.prisma
 *    at build time, so if production DB is missing columns the
 *    generated client SELECT *'s blow up. ensureSchema() runs an
 *    idempotent ALTER TABLE / CREATE TABLE IF NOT EXISTS pass on
 *    cold start to bring the DB up to the expected shape.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  covenantMigrationsRan: boolean | undefined;
};

/**
 * Augment DATABASE_URL so the connection has explicit timeouts +
 * sensible pool sizing. Idempotent — only adds query params that
 * aren't already present.
 */
function tunedDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (!url.searchParams.has("connect_timeout")) {
      url.searchParams.set("connect_timeout", "30");
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", "30");
    }
    // Pgbouncer pooling on Neon — needed so Prisma uses prepared
    // statement cache compatibly.
    if (raw.includes("pooler") && !url.searchParams.has("pgbouncer")) {
      url.searchParams.set("pgbouncer", "true");
    }
    return url.toString();
  } catch {
    // If DATABASE_URL is not a valid URL, fall back to raw.
    return raw;
  }
}

function makeClient(): PrismaClient {
  const url = tunedDatabaseUrl();
  // Build the options object explicitly typed against Prisma's own
  // PrismaClientOptions. Without the explicit annotation the conditional
  // produces a union type that TS can't reconcile against the constructor
  // signature under strict mode, and spread of readonly log arrays widens
  // to `string[]` which doesn't satisfy LogLevel[].
  const options: Prisma.PrismaClientOptions = {
    log: ["error", "warn"],
  };
  if (url) {
    options.datasources = { db: { url } };
  }
  return new PrismaClient(options);
}

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Wrap a Prisma operation with one cold-start retry.
 *
 * Errors that look like a paused-DB cold start get retried after
 * 1.5 seconds. Other errors propagate immediately so we don't mask
 * real bugs (auth, schema, etc.) under retries.
 */
export async function retryable<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const coldStart =
      /can't reach database|connection terminated|connect ETIMEDOUT|connect ECONNREFUSED|EAI_AGAIN|connection reset|server closed the connection unexpectedly/i.test(
        msg,
      );
    if (!coldStart) throw err;
    console.warn(
      "[prisma] cold-start error, retrying after 1.5s:",
      msg.slice(0, 200),
    );
    await new Promise((r) => setTimeout(r, 1500));
    return await fn();
  }
}

const MIGRATION_SQL = [
  // Job new columns (added during Credit Phase 1-3)
  `ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "escrowAta" TEXT`,
  `ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "pda" TEXT`,

  // ClaimListing — new table from Covenant Credit
  `CREATE TABLE IF NOT EXISTS "ClaimListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pda" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "jobPda" TEXT NOT NULL,
    "sellerWallet" TEXT NOT NULL,
    "buyerWallet" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "faceValue" DOUBLE PRECISION NOT NULL,
    "priceAtomic" TEXT NOT NULL,
    "faceValueAtomic" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Listed',
    "listedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "boughtAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "listTxHash" TEXT,
    "buyTxHash" TEXT,
    "cancelTxHash" TEXT,
    "settleTxHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ClaimListing_pda_key" ON "ClaimListing"("pda")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ClaimListing_jobId_key" ON "ClaimListing"("jobId")`,
  `CREATE INDEX IF NOT EXISTS "ClaimListing_sellerWallet_idx" ON "ClaimListing"("sellerWallet")`,
  `CREATE INDEX IF NOT EXISTS "ClaimListing_buyerWallet_idx" ON "ClaimListing"("buyerWallet")`,
  `CREATE INDEX IF NOT EXISTS "ClaimListing_status_idx" ON "ClaimListing"("status")`,
  `CREATE INDEX IF NOT EXISTS "ClaimListing_listedAt_idx" ON "ClaimListing"("listedAt")`,

  // Job.pda unique index (partial — only where value is present)
  `CREATE UNIQUE INDEX IF NOT EXISTS "Job_pda_key" ON "Job"("pda") WHERE "pda" IS NOT NULL`,

  // X402Payment — consumed x402 payment signatures (replay + idempotency).
  `CREATE TABLE IF NOT EXISTS "X402Payment" (
    "txSignature" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "payer" TEXT NOT NULL,
    "amountAtomic" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseBody" TEXT,
    "responseCode" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS "X402Payment_agentId_idx" ON "X402Payment"("agentId")`,
  `CREATE INDEX IF NOT EXISTS "X402Payment_payer_idx" ON "X402Payment"("payer")`,

  // AgentRevenue.paymentTx — ties each paid row to a verified payment (C-037).
  `ALTER TABLE "AgentRevenue" ADD COLUMN IF NOT EXISTS "paymentTx" TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "AgentRevenue_paymentTx_key" ON "AgentRevenue"("paymentTx")`,

  // AdminAuditLog — durable audit trail of admin endpoint access (C-095).
  `CREATE TABLE IF NOT EXISTS "AdminAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "ip" TEXT,
    "authorized" BOOLEAN NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS "AdminAuditLog_action_idx" ON "AdminAuditLog"("action")`,
  `CREATE INDEX IF NOT EXISTS "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt")`,

  // RateLimit — distributed fixed-window counters (C-092 / H-04).
  `CREATE TABLE IF NOT EXISTS "RateLimit" (
    "bucket" TEXT NOT NULL PRIMARY KEY,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "RateLimit_expiresAt_idx" ON "RateLimit"("expiresAt")`,
];

export async function ensureSchema(): Promise<void> {
  if (globalForPrisma.covenantMigrationsRan) return;
  globalForPrisma.covenantMigrationsRan = true;
  try {
    for (const sql of MIGRATION_SQL) {
      try {
        await retryable(() => prisma.$executeRawUnsafe(sql));
      } catch (stepErr) {
        console.error(
          "[prisma] migration step failed (non-fatal):",
          sql.slice(0, 60),
          stepErr,
        );
      }
    }
    console.log("[prisma] runtime schema sync complete");
  } catch (err) {
    console.error("[prisma] runtime schema sync failed:", err);
    globalForPrisma.covenantMigrationsRan = false;
  }
}

// Fire-and-forget on module load. Any query that races ahead will
// either succeed (DB already matches) or fail with a retry chance
// on the next request.
void ensureSchema();
