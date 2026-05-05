-- Shared ballot voting link on cycle; nullable legacy per-invite tokens.

ALTER TABLE "AllStarInvite" ALTER COLUMN "tokenHash" DROP NOT NULL;

ALTER TABLE "AllStarBallotCycle" ADD COLUMN "ballotLinkToken" TEXT;
ALTER TABLE "AllStarBallotCycle" ADD COLUMN "ballotLinkTokenHash" TEXT;

CREATE UNIQUE INDEX "AllStarBallotCycle_ballotLinkToken_key" ON "AllStarBallotCycle"("ballotLinkToken");
CREATE UNIQUE INDEX "AllStarBallotCycle_ballotLinkTokenHash_key" ON "AllStarBallotCycle"("ballotLinkTokenHash");
