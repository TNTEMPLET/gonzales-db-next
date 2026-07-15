-- CreateEnum
CREATE TYPE "VolunteerProfileStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "VolunteerRole" AS ENUM ('HEAD_COACH', 'ASSISTANT_COACH', 'TEAM_PARENT', 'BOARD', 'OTHER');

-- CreateEnum
CREATE TYPE "VolunteerRequirementKey" AS ENUM ('JDP', 'ABUSE_AWARENESS');

-- CreateEnum
CREATE TYPE "VolunteerRequirementStatusValue" AS ENUM ('NOT_STARTED', 'PENDING', 'CLEAR', 'EXPIRED', 'FAILED', 'WAIVED');

-- CreateTable
CREATE TABLE "VolunteerProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "registeredUserId" TEXT NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "status" "VolunteerProfileStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolunteerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolunteerRoleAssignment" (
    "id" TEXT NOT NULL,
    "volunteerProfileId" TEXT NOT NULL,
    "role" "VolunteerRole" NOT NULL,
    "teamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VolunteerRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolunteerRequirementDef" (
    "key" "VolunteerRequirementKey" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "requiredByDefault" BOOLEAN NOT NULL DEFAULT true,
    "allowsVolunteerUpload" BOOLEAN NOT NULL DEFAULT false,
    "expiresAfterDays" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolunteerRequirementDef_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "VolunteerRequirementStatus" (
    "id" TEXT NOT NULL,
    "volunteerProfileId" TEXT NOT NULL,
    "requirementKey" "VolunteerRequirementKey" NOT NULL,
    "status" "VolunteerRequirementStatusValue" NOT NULL DEFAULT 'NOT_STARTED',
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "externalRef" TEXT,
    "documentUrl" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "uploadedAt" TIMESTAMP(3),
    "reviewedByAdminId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolunteerRequirementStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VolunteerProfile_organizationId_seasonYear_status_idx" ON "VolunteerProfile"("organizationId", "seasonYear", "status");

-- CreateIndex
CREATE INDEX "VolunteerProfile_registeredUserId_idx" ON "VolunteerProfile"("registeredUserId");

-- CreateIndex
CREATE UNIQUE INDEX "VolunteerProfile_organizationId_registeredUserId_seasonYear_key" ON "VolunteerProfile"("organizationId", "registeredUserId", "seasonYear");

-- CreateIndex
CREATE INDEX "VolunteerRoleAssignment_volunteerProfileId_idx" ON "VolunteerRoleAssignment"("volunteerProfileId");

-- CreateIndex
CREATE INDEX "VolunteerRoleAssignment_role_idx" ON "VolunteerRoleAssignment"("role");

-- CreateIndex
CREATE UNIQUE INDEX "VolunteerRoleAssignment_volunteerProfileId_role_teamId_key" ON "VolunteerRoleAssignment"("volunteerProfileId", "role", "teamId");

-- CreateIndex
CREATE INDEX "VolunteerRequirementStatus_requirementKey_status_idx" ON "VolunteerRequirementStatus"("requirementKey", "status");

-- CreateIndex
CREATE INDEX "VolunteerRequirementStatus_volunteerProfileId_status_idx" ON "VolunteerRequirementStatus"("volunteerProfileId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "VolunteerRequirementStatus_volunteerProfileId_requirementKey_key" ON "VolunteerRequirementStatus"("volunteerProfileId", "requirementKey");

-- AddForeignKey
ALTER TABLE "VolunteerProfile" ADD CONSTRAINT "VolunteerProfile_registeredUserId_fkey" FOREIGN KEY ("registeredUserId") REFERENCES "RegisteredUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerRoleAssignment" ADD CONSTRAINT "VolunteerRoleAssignment_volunteerProfileId_fkey" FOREIGN KEY ("volunteerProfileId") REFERENCES "VolunteerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerRequirementStatus" ADD CONSTRAINT "VolunteerRequirementStatus_volunteerProfileId_fkey" FOREIGN KEY ("volunteerProfileId") REFERENCES "VolunteerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerRequirementStatus" ADD CONSTRAINT "VolunteerRequirementStatus_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed requirement catalog
INSERT INTO "VolunteerRequirementDef" ("key", "label", "description", "requiredByDefault", "allowsVolunteerUpload", "expiresAfterDays", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('JDP', 'JDP Background Check', 'Background check clearance via JDP (or league-approved equivalent). Admin marks status; volunteers cannot self-clear.', true, false, 365, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ABUSE_AWARENESS', 'Abuse Awareness Training', 'Abuse awareness / diamond leader style certificate upload.', true, true, NULL, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
