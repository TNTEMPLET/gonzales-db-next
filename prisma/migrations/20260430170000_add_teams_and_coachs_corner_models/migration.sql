-- CreateEnum
CREATE TYPE "TeamCoachRole" AS ENUM ('HEAD_COACH', 'ASSISTANT_COACH');

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "ageGroup" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "contactNotes" TEXT,
    "practicePlan" TEXT,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamCoachAssignment" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "registeredUserId" TEXT NOT NULL,
    "role" "TeamCoachRole" NOT NULL DEFAULT 'ASSISTANT_COACH',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamCoachAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamPlayer" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "fullName" TEXT NOT NULL,
    "contactPhone" TEXT,
    "rosterStatus" TEXT,
    "jerseyNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamGameNote" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "gameExternalId" TEXT NOT NULL,
    "note" TEXT,
    "availabilityNote" TEXT,
    "authoredByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamGameNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Team_organizationId_seasonYear_ageGroup_teamName_key" ON "Team"("organizationId", "seasonYear", "ageGroup", "teamName");

-- CreateIndex
CREATE INDEX "Team_organizationId_seasonYear_ageGroup_idx" ON "Team"("organizationId", "seasonYear", "ageGroup");

-- CreateIndex
CREATE UNIQUE INDEX "TeamCoachAssignment_teamId_registeredUserId_key" ON "TeamCoachAssignment"("teamId", "registeredUserId");

-- CreateIndex
CREATE INDEX "TeamCoachAssignment_registeredUserId_role_idx" ON "TeamCoachAssignment"("registeredUserId", "role");

-- CreateIndex
CREATE INDEX "TeamPlayer_teamId_fullName_idx" ON "TeamPlayer"("teamId", "fullName");

-- CreateIndex
CREATE UNIQUE INDEX "TeamGameNote_teamId_gameExternalId_key" ON "TeamGameNote"("teamId", "gameExternalId");

-- CreateIndex
CREATE INDEX "TeamGameNote_authoredByUserId_updatedAt_idx" ON "TeamGameNote"("authoredByUserId", "updatedAt");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamCoachAssignment" ADD CONSTRAINT "TeamCoachAssignment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamCoachAssignment" ADD CONSTRAINT "TeamCoachAssignment_registeredUserId_fkey" FOREIGN KEY ("registeredUserId") REFERENCES "RegisteredUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPlayer" ADD CONSTRAINT "TeamPlayer_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamGameNote" ADD CONSTRAINT "TeamGameNote_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamGameNote" ADD CONSTRAINT "TeamGameNote_authoredByUserId_fkey" FOREIGN KEY ("authoredByUserId") REFERENCES "RegisteredUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
