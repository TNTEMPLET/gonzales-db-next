-- Generic non-RegisteredUser recipient support for Communications, so modules whose
-- contacts aren't RegisteredUsers (Sponsors, Team roster guardians, Coaching Interest
-- selections, All-Star ballot invites, Shirt/Cap Orders manual recipients) can send
-- through the same governed pipeline (suppression, audit trail) as EXPLICIT_USERS does
-- for RegisteredUser-backed audiences.

-- AlterEnum
ALTER TYPE "CommunicationAudienceRuleType" ADD VALUE IF NOT EXISTS 'EXPLICIT_CONTACTS';
ALTER TYPE "CommunicationRecipientType" ADD VALUE IF NOT EXISTS 'RAW_CONTACT';

-- AlterTable: raw contact list on the audience rule, same lifecycle as
-- explicitRegisteredUserIds (normalized + capped before write, see
-- lib/communications/rawContacts.ts).
ALTER TABLE "CommunicationAudienceRule" ADD COLUMN IF NOT EXISTS "explicitContacts" JSONB;

-- AlterTable: generic provenance + display name for RAW_CONTACT rows on snapshots.
-- Not typed FKs on purpose (traceability only, like matchReasons/tripParticipantId).
ALTER TABLE "CommunicationRecipientSnapshot" ADD COLUMN IF NOT EXISTS "contactName" TEXT;
ALTER TABLE "CommunicationRecipientSnapshot" ADD COLUMN IF NOT EXISTS "sourceType" TEXT;
ALTER TABLE "CommunicationRecipientSnapshot" ADD COLUMN IF NOT EXISTS "sourceId" TEXT;

CREATE INDEX IF NOT EXISTS "CommunicationRecipientSnapshot_sourceType_sourceId_idx"
  ON "CommunicationRecipientSnapshot"("sourceType", "sourceId");

-- AlterTable: same provenance copied onto deliveries at send time, since snapshots
-- get wiped/recreated on every resolve but deliveries are permanent history.
ALTER TABLE "CommunicationDelivery" ADD COLUMN IF NOT EXISTS "sourceType" TEXT;
ALTER TABLE "CommunicationDelivery" ADD COLUMN IF NOT EXISTS "sourceId" TEXT;
