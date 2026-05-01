DO $$
BEGIN
  CREATE TYPE "AdminAuditAction" AS ENUM (
    'PROMOTE',
    'DEMOTE',
    'BLOCK',
    'UNBLOCK',
    'REMOVE',
    'GRANT_MASTER',
    'REVOKE_MASTER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'AdminAuditLog'
      AND column_name = 'action'
      AND udt_name <> 'AdminAuditAction'
  ) THEN
    ALTER TABLE "AdminAuditLog"
    ALTER COLUMN "action" TYPE "AdminAuditAction"
    USING ("action"::text::"AdminAuditAction");
  END IF;
END $$;

ALTER TYPE "AdminAuditAction" ADD VALUE IF NOT EXISTS 'GRANT_MASTER';
ALTER TYPE "AdminAuditAction" ADD VALUE IF NOT EXISTS 'REVOKE_MASTER';

ALTER TABLE "AdminUser"
ADD COLUMN IF NOT EXISTS "isMaster" BOOLEAN NOT NULL DEFAULT false;

-- Preserve existing access on current deployments; master assignments can be adjusted in Users after deploy.
UPDATE "AdminUser"
SET "isMaster" = true;
