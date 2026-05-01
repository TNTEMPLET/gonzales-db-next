-- AlterTable
ALTER TABLE "AllStarVaultAccess"
ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'gonzales';

-- DropIndex
DROP INDEX IF EXISTS "AllStarVaultAccess_registeredUserId_key";

-- CreateIndex
CREATE UNIQUE INDEX "AllStarVaultAccess_registeredUserId_organizationId_key"
ON "AllStarVaultAccess"("registeredUserId", "organizationId");

-- CreateIndex
CREATE INDEX "AllStarVaultAccess_organizationId_role_updatedAt_idx"
ON "AllStarVaultAccess"("organizationId", "role", "updatedAt");
