-- CreateEnum
CREATE TYPE "TournamentMonitorRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "TournamentMonitorEventType" AS ENUM ('SITE_DOWN', 'SITE_RECOVERED', 'LIVE_HEARTBEAT', 'GAME_LIVE', 'GAME_FINAL', 'GC_GAME_CREATED', 'GC_GAME_CREATE_WARNING', 'GC_GAME_CREATE_FAILED');

-- CreateTable
CREATE TABLE "TournamentMonitorSubscription" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "channels" "CommunicationChannel"[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentMonitorSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentMonitorRun" (
    "id" TEXT NOT NULL,
    "status" "TournamentMonitorRunStatus" NOT NULL DEFAULT 'PENDING',
    "checkedCount" INTEGER NOT NULL DEFAULT 0,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "results" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "TournamentMonitorRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentMonitorEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT,
    "type" "TournamentMonitorEventType" NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bracketProjectId" TEXT,
    "matchId" TEXT,
    "eventKey" TEXT NOT NULL,
    "statusHash" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "emailSentCount" INTEGER NOT NULL DEFAULT 0,
    "smsSentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentMonitorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TournamentMonitorSubscription_active_idx" ON "TournamentMonitorSubscription"("active");

-- CreateIndex
CREATE INDEX "TournamentMonitorSubscription_email_idx" ON "TournamentMonitorSubscription"("email");

-- CreateIndex
CREATE INDEX "TournamentMonitorSubscription_phone_idx" ON "TournamentMonitorSubscription"("phone");

-- CreateIndex
CREATE INDEX "TournamentMonitorRun_status_createdAt_idx" ON "TournamentMonitorRun"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentMonitorEvent_eventKey_key" ON "TournamentMonitorEvent"("eventKey");

-- CreateIndex
CREATE INDEX "TournamentMonitorEvent_type_createdAt_idx" ON "TournamentMonitorEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "TournamentMonitorEvent_organizationId_type_createdAt_idx" ON "TournamentMonitorEvent"("organizationId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "TournamentMonitorEvent_bracketProjectId_matchId_type_idx" ON "TournamentMonitorEvent"("bracketProjectId", "matchId", "type");

-- CreateIndex
CREATE INDEX "TournamentMonitorEvent_runId_idx" ON "TournamentMonitorEvent"("runId");

-- AddForeignKey
ALTER TABLE "TournamentMonitorEvent" ADD CONSTRAINT "TournamentMonitorEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TournamentMonitorRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMonitorEvent" ADD CONSTRAINT "TournamentMonitorEvent_bracketProjectId_fkey" FOREIGN KEY ("bracketProjectId") REFERENCES "BracketProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
