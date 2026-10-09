-- Season mode override. Additive only.
-- Existing SeasonOrgSettings rows stay null. No backfill and no data changes.

-- CreateEnum
CREATE TYPE "SeasonMode" AS ENUM ('OFF_SEASON', 'PRESEASON', 'IN_SEASON', 'POSTSEASON');

-- AlterTable
ALTER TABLE "SeasonOrgSettings" ADD COLUMN "seasonModeOverride" "SeasonMode",
ADD COLUMN "seasonModeOverrideAt" TIMESTAMP(3),
ADD COLUMN "seasonModeOverrideByAdminId" TEXT;
