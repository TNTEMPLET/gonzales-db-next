-- AlterTable
ALTER TABLE "DraftSession" ADD COLUMN "scheduledStartAt" TIMESTAMP(3),
ADD COLUMN "invitesSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "DraftTeam" ADD COLUMN "autoDraftEnabled" BOOLEAN NOT NULL DEFAULT false;
