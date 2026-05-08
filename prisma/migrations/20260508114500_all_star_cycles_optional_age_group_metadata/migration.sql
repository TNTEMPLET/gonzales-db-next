-- Add optional All-Star age metadata to cycle records.
ALTER TABLE "AllStarBallotCycle"
ADD COLUMN "allStarAgeGroupId" TEXT,
ADD COLUMN "allStarAgeGroupLabel" TEXT;

CREATE INDEX "AllStarBallotCycle_organizationId_seasonYear_allStarAgeGroupId_idx"
ON "AllStarBallotCycle"("organizationId", "seasonYear", "allStarAgeGroupId");
