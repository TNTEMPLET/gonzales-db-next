-- CreateEnum
CREATE TYPE "AllStarBallotPhase" AS ENUM ('FIRST_TEAM', 'SECOND_TEAM');

-- AlterTable
ALTER TABLE "AllStarBallotCycle"
ADD COLUMN "activePhase" "AllStarBallotPhase" NOT NULL DEFAULT 'FIRST_TEAM',
ADD COLUMN "secondPhaseGeneratedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AllStarCandidate"
ADD COLUMN "excludedFromSecondPhase" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "secondPhaseOverrideAt" TIMESTAMP(3),
ADD COLUMN "secondPhaseOverrideByAdminId" TEXT,
ADD COLUMN "secondPhaseOverrideReason" TEXT;

-- AlterTable
ALTER TABLE "AllStarInvite"
ADD COLUMN "phase" "AllStarBallotPhase" NOT NULL DEFAULT 'FIRST_TEAM';

-- AlterTable
ALTER TABLE "AllStarVoteDraft"
ADD COLUMN "phase" "AllStarBallotPhase" NOT NULL DEFAULT 'FIRST_TEAM';

-- AlterTable
ALTER TABLE "AllStarVoteSubmission"
ADD COLUMN "phase" "AllStarBallotPhase" NOT NULL DEFAULT 'FIRST_TEAM';

-- DropIndex
DROP INDEX "AllStarVoteDraft_ballotCycleId_coachUserId_key";

-- DropIndex
DROP INDEX "AllStarVoteSubmission_ballotCycleId_coachUserId_key";

-- CreateIndex
CREATE INDEX "AllStarInvite_ballotCycleId_phase_invitedEmail_idx"
ON "AllStarInvite"("ballotCycleId", "phase", "invitedEmail");

-- CreateIndex
CREATE INDEX "AllStarInvite_organizationId_ageGroup_phase_idx"
ON "AllStarInvite"("organizationId", "ageGroup", "phase");

-- CreateIndex
CREATE INDEX "AllStarVoteDraft_organizationId_ageGroup_phase_idx"
ON "AllStarVoteDraft"("organizationId", "ageGroup", "phase");

-- CreateIndex
CREATE UNIQUE INDEX "AllStarVoteDraft_ballotCycleId_coachUserId_phase_key"
ON "AllStarVoteDraft"("ballotCycleId", "coachUserId", "phase");

-- CreateIndex
CREATE INDEX "AllStarVoteSubmission_organizationId_ageGroup_phase_submittedAt_idx"
ON "AllStarVoteSubmission"("organizationId", "ageGroup", "phase", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AllStarVoteSubmission_ballotCycleId_coachUserId_phase_key"
ON "AllStarVoteSubmission"("ballotCycleId", "coachUserId", "phase");

-- AddForeignKey
ALTER TABLE "AllStarCandidate"
ADD CONSTRAINT "AllStarCandidate_secondPhaseOverrideByAdminId_fkey"
FOREIGN KEY ("secondPhaseOverrideByAdminId") REFERENCES "AdminUser"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
