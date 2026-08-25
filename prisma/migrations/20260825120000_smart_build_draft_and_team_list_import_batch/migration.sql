-- CreateEnum
CREATE TYPE "DraftType" AS ENUM ('SNAKE', 'LINEAR');

-- CreateEnum
CREATE TYPE "DraftSessionStatus" AS ENUM ('SETUP', 'PAIRED', 'LIVE', 'PAUSED', 'COMPLETED', 'MATERIALIZED');

-- CreateEnum
CREATE TYPE "DraftProtectionType" AS ENUM ('HEAD_COACH_CHILD', 'ASSISTANT_COACH_CHILD', 'PAIRING_REQUEST');

-- DropIndex
DROP INDEX "RegisteredUser_email_key";

-- CreateTable
CREATE TABLE "TeamListImportBatch" (
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

    CONSTRAINT "TeamListImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "ageGroup" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "draftType" "DraftType" NOT NULL DEFAULT 'SNAKE',
    "status" "DraftSessionStatus" NOT NULL DEFAULT 'SETUP',
    "secondsPerPick" INTEGER DEFAULT 120,
    "totalRounds" INTEGER NOT NULL DEFAULT 12,
    "currentRound" INTEGER NOT NULL DEFAULT 1,
    "currentPickIndex" INTEGER NOT NULL DEFAULT 0,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftTeam" (
    "id" TEXT NOT NULL,
    "draftSessionId" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "draftOrder" INTEGER NOT NULL,
    "headCoachUserId" TEXT,
    "assistantUserId" TEXT,
    "targetTeamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachPlayerProtection" (
    "id" TEXT NOT NULL,
    "draftSessionId" TEXT NOT NULL,
    "draftTeamId" TEXT NOT NULL,
    "registeredUserId" TEXT,
    "playerName" TEXT NOT NULL,
    "guardianEmail" TEXT,
    "protectionType" "DraftProtectionType" NOT NULL DEFAULT 'HEAD_COACH_CHILD',
    "protectedRound" INTEGER NOT NULL DEFAULT 1,
    "isClaimed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachPlayerProtection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftPlayerPool" (
    "id" TEXT NOT NULL,
    "draftSessionId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "fullName" TEXT NOT NULL,
    "guardianEmail" TEXT,
    "guardianPhone" TEXT,
    "birthDate" TIMESTAMP(3),
    "evaluationScore" DOUBLE PRECISION,
    "pitcherRating" INTEGER,
    "catcherRating" INTEGER,
    "notes" TEXT,
    "isDrafted" BOOLEAN NOT NULL DEFAULT false,
    "draftedTeamId" TEXT,
    "draftedPickId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftPlayerPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftPick" (
    "id" TEXT NOT NULL,
    "draftSessionId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "overallPick" INTEGER NOT NULL,
    "draftTeamId" TEXT NOT NULL,
    "playerPoolId" TEXT NOT NULL,
    "isProtectedPick" BOOLEAN NOT NULL DEFAULT false,
    "pickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pickedByAdminId" TEXT,

    CONSTRAINT "DraftPick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamListImportBatch_organizationId_createdAt_idx" ON "TeamListImportBatch"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "TeamListImportBatch_organizationId_undoneAt_createdAt_idx" ON "TeamListImportBatch"("organizationId", "undoneAt", "createdAt");

-- CreateIndex
CREATE INDEX "DraftSession_organizationId_seasonYear_ageGroup_idx" ON "DraftSession"("organizationId", "seasonYear", "ageGroup");

-- CreateIndex
CREATE INDEX "DraftSession_organizationId_status_idx" ON "DraftSession"("organizationId", "status");

-- CreateIndex
CREATE INDEX "DraftTeam_draftSessionId_idx" ON "DraftTeam"("draftSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftTeam_draftSessionId_draftOrder_key" ON "DraftTeam"("draftSessionId", "draftOrder");

-- CreateIndex
CREATE INDEX "CoachPlayerProtection_draftSessionId_idx" ON "CoachPlayerProtection"("draftSessionId");

-- CreateIndex
CREATE INDEX "CoachPlayerProtection_draftTeamId_idx" ON "CoachPlayerProtection"("draftTeamId");

-- CreateIndex
CREATE INDEX "DraftPlayerPool_draftSessionId_isDrafted_idx" ON "DraftPlayerPool"("draftSessionId", "isDrafted");

-- CreateIndex
CREATE INDEX "DraftPick_draftSessionId_idx" ON "DraftPick"("draftSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftPick_draftSessionId_overallPick_key" ON "DraftPick"("draftSessionId", "overallPick");

-- CreateIndex
CREATE INDEX "RegisteredUser_email_idx" ON "RegisteredUser"("email");

-- AddForeignKey
ALTER TABLE "TeamListImportBatch" ADD CONSTRAINT "TeamListImportBatch_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftTeam" ADD CONSTRAINT "DraftTeam_draftSessionId_fkey" FOREIGN KEY ("draftSessionId") REFERENCES "DraftSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftTeam" ADD CONSTRAINT "DraftTeam_headCoachUserId_fkey" FOREIGN KEY ("headCoachUserId") REFERENCES "RegisteredUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftTeam" ADD CONSTRAINT "DraftTeam_assistantUserId_fkey" FOREIGN KEY ("assistantUserId") REFERENCES "RegisteredUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachPlayerProtection" ADD CONSTRAINT "CoachPlayerProtection_draftSessionId_fkey" FOREIGN KEY ("draftSessionId") REFERENCES "DraftSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachPlayerProtection" ADD CONSTRAINT "CoachPlayerProtection_draftTeamId_fkey" FOREIGN KEY ("draftTeamId") REFERENCES "DraftTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPlayerPool" ADD CONSTRAINT "DraftPlayerPool_draftSessionId_fkey" FOREIGN KEY ("draftSessionId") REFERENCES "DraftSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_draftSessionId_fkey" FOREIGN KEY ("draftSessionId") REFERENCES "DraftSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_draftTeamId_fkey" FOREIGN KEY ("draftTeamId") REFERENCES "DraftTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
