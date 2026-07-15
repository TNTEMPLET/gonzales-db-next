-- Volunteer roles as Master Admin–managed DB catalog (replaces VolunteerRole enum).

-- CreateTable
CREATE TABLE "VolunteerRoleDef" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolunteerRoleDef_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VolunteerRoleDef_key_key" ON "VolunteerRoleDef"("key");

-- CreateIndex
CREATE INDEX "VolunteerRoleDef_isActive_sortOrder_idx" ON "VolunteerRoleDef"("isActive", "sortOrder");

-- AddForeignKey
ALTER TABLE "VolunteerRoleDef" ADD CONSTRAINT "VolunteerRoleDef_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed from Sports Connect sheet roles
INSERT INTO "VolunteerRoleDef" ("id", "key", "label", "description", "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('cvolrole0000000000000000001', 'LEAGUE_HEAD_COACH', 'League Head Coach', 'Sports Connect: League Head Coach', true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cvolrole0000000000000000002', 'LEAGUE_ASSISTANT_COACH', 'League Assistant Coach', 'Sports Connect: League Assistant Coach', true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cvolrole0000000000000000003', 'HEAD_COACH', 'Head Coach', 'Sports Connect: Head Coach (rare distinct value)', true, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cvolrole0000000000000000004', 'AP_BASEBALL_UMPIRE', 'AP Baseball Umpire', 'Sports Connect: AP Baseball Umpire', true, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cvolrole0000000000000000005', 'OTHER_AP_POSITIONS', 'Other AP Positions  (NOT COACHES)', 'Sports Connect: Other AP Positions  (NOT COACHES)', true, 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Convert VolunteerRoleAssignment.role (enum) -> roleKey (text FK)
ALTER TABLE "VolunteerRoleAssignment" ADD COLUMN "roleKey" TEXT;

UPDATE "VolunteerRoleAssignment"
SET "roleKey" = "role"::text;

ALTER TABLE "VolunteerRoleAssignment" ALTER COLUMN "roleKey" SET NOT NULL;

-- Drop old unique/index on enum column
DROP INDEX IF EXISTS "VolunteerRoleAssignment_volunteerProfileId_role_teamId_key";
DROP INDEX IF EXISTS "VolunteerRoleAssignment_role_idx";

ALTER TABLE "VolunteerRoleAssignment" DROP COLUMN "role";

-- Drop enum type
DROP TYPE IF EXISTS "VolunteerRole";

-- New indexes + FK
CREATE UNIQUE INDEX "VolunteerRoleAssignment_volunteerProfileId_roleKey_teamId_key" ON "VolunteerRoleAssignment"("volunteerProfileId", "roleKey", "teamId");
CREATE INDEX "VolunteerRoleAssignment_roleKey_idx" ON "VolunteerRoleAssignment"("roleKey");

ALTER TABLE "VolunteerRoleAssignment" ADD CONSTRAINT "VolunteerRoleAssignment_roleKey_fkey" FOREIGN KEY ("roleKey") REFERENCES "VolunteerRoleDef"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
