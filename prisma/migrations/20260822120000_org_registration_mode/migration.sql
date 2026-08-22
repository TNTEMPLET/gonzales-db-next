-- CreateEnum
CREATE TYPE "RegistrationMode" AS ENUM ('AUTO_SCHEDULED', 'OPEN', 'WAITLIST', 'CLOSED');

-- AlterTable
ALTER TABLE "OrgRegistrationWindow" ADD COLUMN "mode" "RegistrationMode" NOT NULL DEFAULT 'AUTO_SCHEDULED';

-- CRITICAL: Fall Ball registration must remain in Waitlist mode through this migration.
-- The column default (AUTO_SCHEDULED) would otherwise fall back to the stored start/end
-- window for any pre-existing "fallball" row, which would re-open regular registration.
-- Pin it explicitly so Fall Ball's status does not change.
UPDATE "OrgRegistrationWindow" SET "mode" = 'WAITLIST' WHERE "organizationId" = 'fallball';
