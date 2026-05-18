-- Configurable runoff / team-fill ballot metadata.
ALTER TABLE "AllStarBallotCycle" ADD COLUMN "runoffIsFinalVote" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AllStarBallotCycle" ADD COLUMN "runoffTeamTarget" "AllStarBallotPhase";
ALTER TABLE "AllStarBallotCycle" ADD COLUMN "runoffPlayersNeeded" INTEGER;
