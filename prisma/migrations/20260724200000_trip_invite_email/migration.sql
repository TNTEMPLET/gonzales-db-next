-- Trip guardian recipient type for personalized travel invite emails
ALTER TYPE "CommunicationRecipientType" ADD VALUE IF NOT EXISTS 'TRIP_GUARDIAN';

-- Optional trip participant linkage on snapshots/deliveries
ALTER TABLE "CommunicationRecipientSnapshot" ADD COLUMN IF NOT EXISTS "tripParticipantId" TEXT;
ALTER TABLE "CommunicationDelivery" ADD COLUMN IF NOT EXISTS "tripParticipantId" TEXT;

CREATE INDEX IF NOT EXISTS "CommunicationRecipientSnapshot_tripParticipantId_idx"
  ON "CommunicationRecipientSnapshot"("tripParticipantId");
CREATE INDEX IF NOT EXISTS "CommunicationDelivery_tripParticipantId_idx"
  ON "CommunicationDelivery"("tripParticipantId");

-- Track invite email sends on trip participants
ALTER TABLE "TripParticipant" ADD COLUMN IF NOT EXISTS "inviteEmailSentAt" TIMESTAMP(3);
ALTER TABLE "TripParticipant" ADD COLUMN IF NOT EXISTS "inviteEmailTo" TEXT;
ALTER TABLE "TripParticipant" ADD COLUMN IF NOT EXISTS "inviteEmailCount" INTEGER NOT NULL DEFAULT 0;
