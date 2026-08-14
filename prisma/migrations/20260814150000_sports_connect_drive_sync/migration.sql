-- Google Drive SportsConnect ingestion: per-org folder mapping + Drive-sync lease
-- tracking on the existing SportsConnectImportRun audit table. schema.prisma was
-- updated for this feature but this migration was never generated/deployed, which
-- is why production queries against these columns/table were failing (P2021/P2022).

-- AlterTable: Drive-sync lease/dedup fields on the existing audit run table.
ALTER TABLE "SportsConnectImportRun" ADD COLUMN IF NOT EXISTS "driveFileId" TEXT;
ALTER TABLE "SportsConnectImportRun" ADD COLUMN IF NOT EXISTS "revisionToken" TEXT;
ALTER TABLE "SportsConnectImportRun" ADD COLUMN IF NOT EXISTS "leaseExpiresAt" TIMESTAMP(3);

-- CreateIndex: backs the atomic lease-acquisition dedup check in
-- lib/sportsConnect/driveSync.ts (acquireDriveRunLease).
CREATE UNIQUE INDEX IF NOT EXISTS "SportsConnectImportRun_organizationId_seasonYear_driveFileId_revisionToken_key"
  ON "SportsConnectImportRun"("organizationId", "seasonYear", "driveFileId", "revisionToken");

-- CreateTable: explicit organizationId -> Google Drive folder ID mapping.
CREATE TABLE IF NOT EXISTS "SportsConnectOrgDriveFolder" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "driveFolderId"  TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SportsConnectOrgDriveFolder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SportsConnectOrgDriveFolder_organizationId_key"
  ON "SportsConnectOrgDriveFolder"("organizationId");
