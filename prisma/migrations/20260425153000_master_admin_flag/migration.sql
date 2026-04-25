ALTER TYPE "AdminAuditAction" ADD VALUE IF NOT EXISTS 'GRANT_MASTER';
ALTER TYPE "AdminAuditAction" ADD VALUE IF NOT EXISTS 'REVOKE_MASTER';

ALTER TABLE "AdminUser"
ADD COLUMN "isMaster" BOOLEAN NOT NULL DEFAULT false;

-- Preserve existing access on current deployments; master assignments can be adjusted in Users after deploy.
UPDATE "AdminUser"
SET "isMaster" = true;
