-- Runoff ballot: link child cycle to parent and store pool / first-team split metadata.
ALTER TABLE "AllStarBallotCycle" ADD COLUMN "parentBallotCycleId" TEXT;
ALTER TABLE "AllStarBallotCycle" ADD COLUMN "runoffPoolSize" INTEGER;
ALTER TABLE "AllStarBallotCycle" ADD COLUMN "runoffFirstTeamSize" INTEGER;

CREATE INDEX "AllStarBallotCycle_parentBallotCycleId_idx" ON "AllStarBallotCycle"("parentBallotCycleId");

ALTER TABLE "AllStarBallotCycle" ADD CONSTRAINT "AllStarBallotCycle_parentBallotCycleId_fkey" FOREIGN KEY ("parentBallotCycleId") REFERENCES "AllStarBallotCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
