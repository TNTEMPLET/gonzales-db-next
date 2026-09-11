-- AlterEnum
ALTER TYPE "CommunicationAudienceRuleType" ADD VALUE 'DIVISION_COACHES';
ALTER TYPE "CommunicationAudienceRuleType" ADD VALUE 'DIVISION_PARENTS';

-- AlterTable
ALTER TABLE "CommunicationAudienceRule" ADD COLUMN "ageGroups" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "CommunicationAudienceRule" ADD COLUMN "seasonYear" INTEGER;
