-- Candidate-level final roster overrides for declined players and replacements.
CREATE TYPE "AllStarFinalRosterOverride" AS ENUM ('SELECTED', 'REMOVED');

ALTER TABLE "AllStarCandidate" ADD COLUMN "finalRosterOverride" "AllStarFinalRosterOverride";
ALTER TABLE "AllStarCandidate" ADD COLUMN "finalRosterOverrideReason" TEXT;
ALTER TABLE "AllStarCandidate" ADD COLUMN "finalRosterOverrideAt" TIMESTAMP(3);
ALTER TABLE "AllStarCandidate" ADD COLUMN "finalRosterOverrideByAdminId" TEXT;

CREATE INDEX "AllStarCandidate_ballotCycleId_finalRosterOverride_idx" ON "AllStarCandidate"("ballotCycleId", "finalRosterOverride");

ALTER TABLE "AllStarCandidate" ADD CONSTRAINT "AllStarCandidate_finalRosterOverrideByAdminId_fkey" FOREIGN KEY ("finalRosterOverrideByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
