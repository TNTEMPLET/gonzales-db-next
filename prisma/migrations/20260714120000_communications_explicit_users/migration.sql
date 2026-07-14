-- AlterEnum
ALTER TYPE "CommunicationAudienceRuleType" ADD VALUE 'EXPLICIT_USERS';

-- AlterTable
ALTER TABLE "CommunicationAudienceRule" ADD COLUMN "explicitRegisteredUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
