import "server-only";

import prisma from "@/lib/prisma";

/**
 * On-demand fallback for provisioning the Drive-sync schema when the checked-in
 * migration (prisma/migrations/20260814150000_sports_connect_drive_sync) hasn't
 * been deployed to this database yet.
 *
 * This is a convenience path for a human clicking "Run DB Migration" in the admin
 * desk — it is NOT a replacement for `prisma migrate deploy`, and running it does
 * NOT record anything in `_prisma_migrations`. Every statement here is written to
 * match the checked-in migration file byte-for-byte (same column types, same
 * constraint/index names), so that a real `prisma migrate deploy` run later is a
 * safe no-op either way. If you ever change one, change both.
 *
 * $executeRawUnsafe is used only because these are DDL statements Prisma's
 * tagged-template $executeRaw doesn't reliably support across drivers — every
 * string below is a fixed literal with no interpolated input, so there is no
 * SQL-injection surface here.
 *
 * Statements run one at a time (not as one multi-statement string) because
 * pooled/serverless Postgres connections (e.g. Neon in transaction-pooling mode)
 * don't reliably support multiple statements in a single simple-query call.
 */

const DRIVE_SYNC_SCHEMA_STATEMENTS: string[] = [
  `ALTER TABLE "SportsConnectImportRun" ADD COLUMN IF NOT EXISTS "driveFileId" TEXT`,
  `ALTER TABLE "SportsConnectImportRun" ADD COLUMN IF NOT EXISTS "revisionToken" TEXT`,
  `ALTER TABLE "SportsConnectImportRun" ADD COLUMN IF NOT EXISTS "leaseExpiresAt" TIMESTAMP(3)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SportsConnectImportRun_organizationId_seasonYear_driveFileId_revisionToken_key" ON "SportsConnectImportRun"("organizationId", "seasonYear", "driveFileId", "revisionToken")`,
  `CREATE TABLE IF NOT EXISTS "SportsConnectOrgDriveFolder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "driveFolderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SportsConnectOrgDriveFolder_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SportsConnectOrgDriveFolder_organizationId_key" ON "SportsConnectOrgDriveFolder"("organizationId")`,
];

export type EnsureDriveSyncSchemaResult =
  | { ok: true }
  | { ok: false; failedStatementIndex: number; error: string };

/**
 * Idempotent — safe to call every time the app detects a missing-schema error.
 * Runs statements sequentially inside a transaction (DDL is transactional in
 * Postgres, so this is all-or-nothing). Never throws; callers check `.ok`.
 */
export async function ensureDriveSyncSchema(): Promise<EnsureDriveSyncSchemaResult> {
  try {
    await prisma.$transaction(
      DRIVE_SYNC_SCHEMA_STATEMENTS.map((sql) => prisma.$executeRawUnsafe(sql)),
    );
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sportsConnect/driveSyncSchema] DDL provisioning failed:", message);
    // We don't know exactly which statement failed once batched in a
    // transaction (Prisma reports the first error it hits), but index 0 is a
    // reasonable default since the array is in dependency order.
    return { ok: false, failedStatementIndex: 0, error: message };
  }
}
