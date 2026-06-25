-- Extend communications audiences for coaching-interest leads.
ALTER TYPE "CommunicationAudienceRuleType" ADD VALUE IF NOT EXISTS 'COACHING_INTEREST';
ALTER TYPE "CommunicationRecipientType" ADD VALUE IF NOT EXISTS 'COACHING_INTEREST';

CREATE TYPE "CoachingInterestRolePreference" AS ENUM (
  'HEAD_COACH',
  'ASSISTANT_COACH',
  'EITHER'
);

CREATE TYPE "CoachingInterestStatus" AS ENUM (
  'NEW',
  'CONTACTED',
  'NOT_INTERESTED',
  'CONVERTED',
  'ARCHIVED'
);

ALTER TABLE "CommunicationAudienceRule"
  ADD COLUMN "coachingInterestStatus" "CoachingInterestStatus";

CREATE INDEX "CommunicationAudienceRule_ruleType_organizationId_coachingInterestStatus_idx"
  ON "CommunicationAudienceRule"("ruleType", "organizationId", "coachingInterestStatus");

CREATE TABLE "CoachingInterestSubmission" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL DEFAULT 'fallball',
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "cellPhone" TEXT NOT NULL,
  "interestedDivision" TEXT NOT NULL,
  "rolePreference" "CoachingInterestRolePreference" NOT NULL DEFAULT 'EITHER',
  "hasCoachedBefore" BOOLEAN NOT NULL DEFAULT false,
  "priorDivision" TEXT,
  "notes" TEXT,
  "status" "CoachingInterestStatus" NOT NULL DEFAULT 'NEW',
  "adminNotes" TEXT,
  "contactedAt" TIMESTAMP(3),
  "convertedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CoachingInterestSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoachingInterestSubmission_organizationId_email_key"
  ON "CoachingInterestSubmission"("organizationId", "email");

CREATE INDEX "CoachingInterestSubmission_organizationId_status_idx"
  ON "CoachingInterestSubmission"("organizationId", "status");

CREATE INDEX "CoachingInterestSubmission_organizationId_rolePreference_idx"
  ON "CoachingInterestSubmission"("organizationId", "rolePreference");

CREATE INDEX "CoachingInterestSubmission_organizationId_interestedDivision_idx"
  ON "CoachingInterestSubmission"("organizationId", "interestedDivision");

CREATE INDEX "CoachingInterestSubmission_createdAt_idx"
  ON "CoachingInterestSubmission"("createdAt");
