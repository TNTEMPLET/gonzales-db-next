-- CreateEnum
CREATE TYPE "AllStarAuditAction" AS ENUM (
  'FINAL_ROSTER_OVERRIDE',
  'SECOND_PHASE_OVERRIDE',
  'CANDIDATE_CREATED',
  'CANDIDATE_UPDATED',
  'CANDIDATE_DELETED',
  'CANDIDATE_IMPORTED',
  'CYCLE_CREATED',
  'CYCLE_UPDATED',
  'CYCLE_DELETED',
  'INVITE_ROSTER_SAVED',
  'INVITE_REVOKED',
  'INVITE_REENABLED',
  'VAULT_ACCESS_UPSERT',
  'VAULT_ACCESS_REVOKED',
  'HEAD_COACH_ADDED',
  'HEAD_COACH_REMOVED',
  'BALLOT_LINK_GENERATED',
  'VOTE_SUBMISSION_DELETED'
);

-- CreateTable
CREATE TABLE "AllStarAuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ballotCycleId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "action" "AllStarAuditAction" NOT NULL,
    "summary" TEXT NOT NULL,
    "beforeState" JSONB,
    "afterState" JSONB,
    "actorAdminId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "sourcePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revertedAt" TIMESTAMP(3),
    "revertedByAdminId" TEXT,

    CONSTRAINT "AllStarAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AllStarAuditLog_organizationId_createdAt_idx" ON "AllStarAuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AllStarAuditLog_ballotCycleId_createdAt_idx" ON "AllStarAuditLog"("ballotCycleId", "createdAt");

-- CreateIndex
CREATE INDEX "AllStarAuditLog_action_createdAt_idx" ON "AllStarAuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AllStarAuditLog_revertedAt_idx" ON "AllStarAuditLog"("revertedAt");

-- AddForeignKey
ALTER TABLE "AllStarAuditLog" ADD CONSTRAINT "AllStarAuditLog_ballotCycleId_fkey" FOREIGN KEY ("ballotCycleId") REFERENCES "AllStarBallotCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllStarAuditLog" ADD CONSTRAINT "AllStarAuditLog_actorAdminId_fkey" FOREIGN KEY ("actorAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllStarAuditLog" ADD CONSTRAINT "AllStarAuditLog_revertedByAdminId_fkey" FOREIGN KEY ("revertedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
