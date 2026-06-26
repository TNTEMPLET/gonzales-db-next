-- CreateEnum
CREATE TYPE "ScheduleManagerJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "ScheduleManagerJobMode" AS ENUM ('DRY_RUN', 'LIVE', 'CRON');

-- CreateEnum
CREATE TYPE "ScheduleManagerActionStatus" AS ENUM ('PLANNED', 'DRY_RUN', 'CREATED', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "ScheduleManagerJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mode" "ScheduleManagerJobMode" NOT NULL,
    "status" "ScheduleManagerJobStatus" NOT NULL DEFAULT 'PENDING',
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB,
    "results" JSONB,
    "errorMessage" TEXT,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ScheduleManagerJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleManagerAction" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "organizationId" TEXT NOT NULL,
    "bracketProjectId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "divisionLabel" TEXT,
    "gameNumber" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "field" TEXT,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "status" "ScheduleManagerActionStatus" NOT NULL DEFAULT 'PLANNED',
    "gameChangerEventId" TEXT,
    "requestSummary" JSONB,
    "responseSummary" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleManagerAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleManagerJob_organizationId_status_createdAt_idx" ON "ScheduleManagerJob"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ScheduleManagerJob_createdByAdminId_idx" ON "ScheduleManagerJob"("createdByAdminId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleManagerAction_bracketProjectId_matchId_key" ON "ScheduleManagerAction"("bracketProjectId", "matchId");

-- CreateIndex
CREATE INDEX "ScheduleManagerAction_organizationId_status_createdAt_idx" ON "ScheduleManagerAction"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ScheduleManagerAction_jobId_idx" ON "ScheduleManagerAction"("jobId");

-- CreateIndex
CREATE INDEX "ScheduleManagerAction_bracketProjectId_idx" ON "ScheduleManagerAction"("bracketProjectId");

-- AddForeignKey
ALTER TABLE "ScheduleManagerJob" ADD CONSTRAINT "ScheduleManagerJob_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleManagerAction" ADD CONSTRAINT "ScheduleManagerAction_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ScheduleManagerJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleManagerAction" ADD CONSTRAINT "ScheduleManagerAction_bracketProjectId_fkey" FOREIGN KEY ("bracketProjectId") REFERENCES "BracketProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
