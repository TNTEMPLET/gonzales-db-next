-- Audience rules always combine with AND (stricter / fewer recipients than OR).
ALTER TABLE "CommunicationCampaign" ALTER COLUMN "logicalMode" SET DEFAULT 'AND';

UPDATE "CommunicationCampaign" SET "logicalMode" = 'AND' WHERE "logicalMode" = 'OR';
