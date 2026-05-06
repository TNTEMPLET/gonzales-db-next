-- DropIndex
DROP INDEX "AllStarBallotCycle_organizationId_seasonYear_ageGroup_key";

-- CreateIndex
CREATE INDEX "AllStarBallotCycle_organizationId_seasonYear_ageGroup_idx"
ON "AllStarBallotCycle"("organizationId", "seasonYear", "ageGroup");
