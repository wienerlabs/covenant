import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  covenantMigrationsRan: boolean | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Runtime idempotent schema migration.
 *
 * Background: Prisma Client is generated from schema.prisma at build
 * time. If the production DB is behind (missing columns / tables),
 * EVERY query that returns a full model does `SELECT *` including
 * the new columns and fails with "column does not exist".
 *
 * Usually fixed via `prisma db push` or `prisma migrate deploy`,
 * but those need a direct-connection DATABASE_URL (not pgbouncer-
 * pooled) and proper Vercel env wiring. When either is missing the
 * deploy ships with a broken DB/client combination.
 *
 * This function brings the DB up to the required shape using
 * `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` and `CREATE TABLE IF
 * NOT EXISTS`. It runs once per serverless instance (cached on
 * globalThis), uses the same DATABASE_URL everything else uses, and
 * is short-circuitable — failure just logs and retries on the next
 * request.
 *
 * Keep this list in sync with every non-trivial addition to
 * schema.prisma. Older columns (pre-Credit) are assumed to have
 * been pushed already.
 */
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
];

export async function ensureSchema(): Promise<void> {
  if (globalForPrisma.covenantMigrationsRan) return;
  globalForPrisma.covenantMigrationsRan = true;
  try {
    for (const sql of MIGRATION_SQL) {
      try {
        await prisma.$executeRawUnsafe(sql);
      } catch (stepErr) {
        // Each statement is idempotent — log but keep going.
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
    // Reset flag so the next request retries.
    globalForPrisma.covenantMigrationsRan = false;
  }
}

// Fire-and-forget on module load. Any query that races ahead will
// either succeed (DB already matches) or fail with a retry chance
// on the next request.
void ensureSchema();
