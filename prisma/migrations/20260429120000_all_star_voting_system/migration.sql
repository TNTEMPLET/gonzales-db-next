-- CreateEnum
CREATE TYPE "NewsStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "AllStarCycleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AllStarAccessMode" AS ENUM ('INVITE_LIST', 'AGE_GROUP_COACHES');

-- CreateEnum
CREATE TYPE "AllStarVaultRole" AS ENUM ('FULL_ACCESS', 'VIEW_ONLY');

-- CreateEnum
CREATE TYPE "DugoutMediaType" AS ENUM ('IMAGE', 'GIF');

-- CreateEnum
CREATE TYPE "DugoutNotificationEntityType" AS ENUM ('POST_LIKE', 'COMMENT');

-- DropIndex
DROP INDEX "NewsPost_slug_idx";

-- DropIndex
DROP INDEX "NewsPost_slug_key";

-- DropIndex
DROP INDEX "NewsPost_status_publishedAt_idx";

-- DropIndex
DROP INDEX "RegisteredUser_email_key";

-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "avatarUrl" TEXT;

-- AlterTable
ALTER TABLE "NewsPost" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'gonzales',
DROP COLUMN "status",
ADD COLUMN     "status" "NewsStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "RegisteredUser" ADD COLUMN     "ageGroup" TEXT,
ADD COLUMN     "assignedTeam" TEXT,
ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "isBlocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isCoach" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'gonzales',
ADD COLUMN     "passwordHash" TEXT,
ALTER COLUMN "googleSub" DROP NOT NULL;

-- CreateTable
CREATE TABLE "CoachSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CoachSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DugoutPost" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'gonzales',
    "content" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "mediaType" "DugoutMediaType",
    "threadId" TEXT,
    "threadOrder" INTEGER,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "pinnedAt" TIMESTAMP(3),
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DugoutPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DugoutComment" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DugoutComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DugoutPostLike" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reaction" TEXT NOT NULL DEFAULT '👍',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DugoutPostLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DugoutNotificationCursor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DugoutNotificationCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DugoutNotificationRead" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" "DugoutNotificationEntityType" NOT NULL,
    "postLikeId" TEXT,
    "commentId" TEXT,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DugoutNotificationRead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameScore" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'gonzales',
    "gameExternalId" TEXT NOT NULL,
    "ageGroup" TEXT,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "gameDate" TIMESTAMP(3),
    "homeScore" INTEGER NOT NULL,
    "awayScore" INTEGER NOT NULL,
    "enteredByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachImportBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByAdminId" TEXT,
    "createdByEmail" TEXT,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "undoPayload" JSONB NOT NULL,
    "undoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllStarBallotCycle" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "ageGroup" TEXT NOT NULL,
    "title" TEXT,
    "status" "AllStarCycleStatus" NOT NULL DEFAULT 'DRAFT',
    "accessMode" "AllStarAccessMode" NOT NULL DEFAULT 'AGE_GROUP_COACHES',
    "publishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllStarBallotCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllStarCandidate" (
    "id" TEXT NOT NULL,
    "ballotCycleId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ageGroup" TEXT NOT NULL,
    "playerFullName" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "jerseyNumber" TEXT NOT NULL,
    "showcaseBibNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllStarCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllStarHeadCoachAssignment" (
    "id" TEXT NOT NULL,
    "ballotCycleId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ageGroup" TEXT NOT NULL,
    "registeredUserId" TEXT,
    "adminUserId" TEXT,
    "coachName" TEXT,
    "coachEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllStarHeadCoachAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllStarVoteDraft" (
    "id" TEXT NOT NULL,
    "ballotCycleId" TEXT NOT NULL,
    "coachUserId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ageGroup" TEXT NOT NULL,
    "ratingsPayload" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllStarVoteDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllStarVoteSubmission" (
    "id" TEXT NOT NULL,
    "ballotCycleId" TEXT NOT NULL,
    "coachUserId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ageGroup" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllStarVoteSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllStarVoteItem" (
    "id" TEXT NOT NULL,
    "voteSubmissionId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllStarVoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllStarInvite" (
    "id" TEXT NOT NULL,
    "ballotCycleId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ageGroup" TEXT NOT NULL,
    "invitedEmail" TEXT NOT NULL,
    "invitedUserId" TEXT,
    "createdByAdminId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllStarInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllStarVaultAccess" (
    "id" TEXT NOT NULL,
    "registeredUserId" TEXT NOT NULL,
    "role" "AllStarVaultRole" NOT NULL,
    "grantedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllStarVaultAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoachSession_tokenHash_key" ON "CoachSession"("tokenHash");

-- CreateIndex
CREATE INDEX "CoachSession_userId_idx" ON "CoachSession"("userId");

-- CreateIndex
CREATE INDEX "CoachSession_expiresAt_idx" ON "CoachSession"("expiresAt");

-- CreateIndex
CREATE INDEX "DugoutPost_organizationId_createdAt_idx" ON "DugoutPost"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "DugoutPost_authorId_idx" ON "DugoutPost"("authorId");

-- CreateIndex
CREATE INDEX "DugoutPost_threadId_threadOrder_idx" ON "DugoutPost"("threadId", "threadOrder");

-- CreateIndex
CREATE INDEX "DugoutPost_isPinned_pinnedAt_idx" ON "DugoutPost"("isPinned", "pinnedAt");

-- CreateIndex
CREATE INDEX "DugoutComment_postId_createdAt_idx" ON "DugoutComment"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "DugoutComment_authorId_createdAt_idx" ON "DugoutComment"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "DugoutComment_parentId_idx" ON "DugoutComment"("parentId");

-- CreateIndex
CREATE INDEX "DugoutPostLike_postId_idx" ON "DugoutPostLike"("postId");

-- CreateIndex
CREATE INDEX "DugoutPostLike_userId_idx" ON "DugoutPostLike"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DugoutPostLike_postId_userId_key" ON "DugoutPostLike"("postId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "DugoutNotificationCursor_userId_key" ON "DugoutNotificationCursor"("userId");

-- CreateIndex
CREATE INDEX "DugoutNotificationCursor_lastSeenAt_idx" ON "DugoutNotificationCursor"("lastSeenAt");

-- CreateIndex
CREATE INDEX "DugoutNotificationRead_userId_readAt_idx" ON "DugoutNotificationRead"("userId", "readAt");

-- CreateIndex
CREATE INDEX "DugoutNotificationRead_entityType_readAt_idx" ON "DugoutNotificationRead"("entityType", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "DugoutNotificationRead_userId_postLikeId_key" ON "DugoutNotificationRead"("userId", "postLikeId");

-- CreateIndex
CREATE UNIQUE INDEX "DugoutNotificationRead_userId_commentId_key" ON "DugoutNotificationRead"("userId", "commentId");

-- CreateIndex
CREATE INDEX "GameScore_organizationId_ageGroup_idx" ON "GameScore"("organizationId", "ageGroup");

-- CreateIndex
CREATE INDEX "GameScore_organizationId_gameDate_idx" ON "GameScore"("organizationId", "gameDate");

-- CreateIndex
CREATE UNIQUE INDEX "GameScore_organizationId_gameExternalId_key" ON "GameScore"("organizationId", "gameExternalId");

-- CreateIndex
CREATE INDEX "CoachImportBatch_organizationId_createdAt_idx" ON "CoachImportBatch"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "CoachImportBatch_organizationId_undoneAt_createdAt_idx" ON "CoachImportBatch"("organizationId", "undoneAt", "createdAt");

-- CreateIndex
CREATE INDEX "AllStarBallotCycle_organizationId_status_ageGroup_idx" ON "AllStarBallotCycle"("organizationId", "status", "ageGroup");

-- CreateIndex
CREATE UNIQUE INDEX "AllStarBallotCycle_organizationId_seasonYear_ageGroup_key" ON "AllStarBallotCycle"("organizationId", "seasonYear", "ageGroup");

-- CreateIndex
CREATE INDEX "AllStarCandidate_ballotCycleId_team_idx" ON "AllStarCandidate"("ballotCycleId", "team");

-- CreateIndex
CREATE INDEX "AllStarCandidate_organizationId_ageGroup_playerFullName_idx" ON "AllStarCandidate"("organizationId", "ageGroup", "playerFullName");

-- CreateIndex
CREATE INDEX "AllStarHeadCoachAssignment_ballotCycleId_idx" ON "AllStarHeadCoachAssignment"("ballotCycleId");

-- CreateIndex
CREATE INDEX "AllStarHeadCoachAssignment_organizationId_ageGroup_idx" ON "AllStarHeadCoachAssignment"("organizationId", "ageGroup");

-- CreateIndex
CREATE INDEX "AllStarVoteDraft_organizationId_ageGroup_idx" ON "AllStarVoteDraft"("organizationId", "ageGroup");

-- CreateIndex
CREATE UNIQUE INDEX "AllStarVoteDraft_ballotCycleId_coachUserId_key" ON "AllStarVoteDraft"("ballotCycleId", "coachUserId");

-- CreateIndex
CREATE INDEX "AllStarVoteSubmission_organizationId_ageGroup_submittedAt_idx" ON "AllStarVoteSubmission"("organizationId", "ageGroup", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AllStarVoteSubmission_ballotCycleId_coachUserId_key" ON "AllStarVoteSubmission"("ballotCycleId", "coachUserId");

-- CreateIndex
CREATE INDEX "AllStarVoteItem_candidateId_rating_idx" ON "AllStarVoteItem"("candidateId", "rating");

-- CreateIndex
CREATE UNIQUE INDEX "AllStarVoteItem_voteSubmissionId_candidateId_key" ON "AllStarVoteItem"("voteSubmissionId", "candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "AllStarInvite_tokenHash_key" ON "AllStarInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "AllStarInvite_ballotCycleId_invitedEmail_idx" ON "AllStarInvite"("ballotCycleId", "invitedEmail");

-- CreateIndex
CREATE INDEX "AllStarInvite_organizationId_ageGroup_idx" ON "AllStarInvite"("organizationId", "ageGroup");

-- CreateIndex
CREATE UNIQUE INDEX "AllStarVaultAccess_registeredUserId_key" ON "AllStarVaultAccess"("registeredUserId");

-- CreateIndex
CREATE INDEX "AllStarVaultAccess_role_updatedAt_idx" ON "AllStarVaultAccess"("role", "updatedAt");

-- CreateIndex
CREATE INDEX "NewsPost_organizationId_status_publishedAt_idx" ON "NewsPost"("organizationId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "NewsPost_organizationId_slug_idx" ON "NewsPost"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "NewsPost_organizationId_slug_key" ON "NewsPost"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "RegisteredUser_organizationId_idx" ON "RegisteredUser"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "RegisteredUser_organizationId_email_key" ON "RegisteredUser"("organizationId", "email");

-- AddForeignKey
ALTER TABLE "CoachSession" ADD CONSTRAINT "CoachSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "RegisteredUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DugoutPost" ADD CONSTRAINT "DugoutPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "RegisteredUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DugoutComment" ADD CONSTRAINT "DugoutComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "DugoutPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DugoutComment" ADD CONSTRAINT "DugoutComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "RegisteredUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DugoutComment" ADD CONSTRAINT "DugoutComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DugoutComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DugoutPostLike" ADD CONSTRAINT "DugoutPostLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "DugoutPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DugoutPostLike" ADD CONSTRAINT "DugoutPostLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "RegisteredUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DugoutNotificationCursor" ADD CONSTRAINT "DugoutNotificationCursor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "RegisteredUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DugoutNotificationRead" ADD CONSTRAINT "DugoutNotificationRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "RegisteredUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DugoutNotificationRead" ADD CONSTRAINT "DugoutNotificationRead_postLikeId_fkey" FOREIGN KEY ("postLikeId") REFERENCES "DugoutPostLike"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DugoutNotificationRead" ADD CONSTRAINT "DugoutNotificationRead_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "DugoutComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameScore" ADD CONSTRAINT "GameScore_enteredByAdminId_fkey" FOREIGN KEY ("enteredByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachImportBatch" ADD CONSTRAINT "CoachImportBatch_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllStarBallotCycle" ADD CONSTRAINT "AllStarBallotCycle_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllStarCandidate" ADD CONSTRAINT "AllStarCandidate_ballotCycleId_fkey" FOREIGN KEY ("ballotCycleId") REFERENCES "AllStarBallotCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllStarHeadCoachAssignment" ADD CONSTRAINT "AllStarHeadCoachAssignment_ballotCycleId_fkey" FOREIGN KEY ("ballotCycleId") REFERENCES "AllStarBallotCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllStarHeadCoachAssignment" ADD CONSTRAINT "AllStarHeadCoachAssignment_registeredUserId_fkey" FOREIGN KEY ("registeredUserId") REFERENCES "RegisteredUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllStarHeadCoachAssignment" ADD CONSTRAINT "AllStarHeadCoachAssignment_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllStarVoteDraft" ADD CONSTRAINT "AllStarVoteDraft_ballotCycleId_fkey" FOREIGN KEY ("ballotCycleId") REFERENCES "AllStarBallotCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllStarVoteDraft" ADD CONSTRAINT "AllStarVoteDraft_coachUserId_fkey" FOREIGN KEY ("coachUserId") REFERENCES "RegisteredUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllStarVoteSubmission" ADD CONSTRAINT "AllStarVoteSubmission_ballotCycleId_fkey" FOREIGN KEY ("ballotCycleId") REFERENCES "AllStarBallotCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllStarVoteSubmission" ADD CONSTRAINT "AllStarVoteSubmission_coachUserId_fkey" FOREIGN KEY ("coachUserId") REFERENCES "RegisteredUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllStarVoteItem" ADD CONSTRAINT "AllStarVoteItem_voteSubmissionId_fkey" FOREIGN KEY ("voteSubmissionId") REFERENCES "AllStarVoteSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllStarVoteItem" ADD CONSTRAINT "AllStarVoteItem_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "AllStarCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllStarInvite" ADD CONSTRAINT "AllStarInvite_ballotCycleId_fkey" FOREIGN KEY ("ballotCycleId") REFERENCES "AllStarBallotCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllStarInvite" ADD CONSTRAINT "AllStarInvite_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "RegisteredUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllStarInvite" ADD CONSTRAINT "AllStarInvite_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllStarVaultAccess" ADD CONSTRAINT "AllStarVaultAccess_registeredUserId_fkey" FOREIGN KEY ("registeredUserId") REFERENCES "RegisteredUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllStarVaultAccess" ADD CONSTRAINT "AllStarVaultAccess_grantedByAdminId_fkey" FOREIGN KEY ("grantedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

