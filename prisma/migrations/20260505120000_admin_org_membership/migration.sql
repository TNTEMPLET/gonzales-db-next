-- Per-organization admin roles. Master Admins use AdminUser.isMaster only (no row required).

CREATE TABLE "AdminOrgMembership" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminOrgMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminOrgMembership_adminUserId_organizationId_key" ON "AdminOrgMembership"("adminUserId", "organizationId");
CREATE INDEX "AdminOrgMembership_organizationId_role_idx" ON "AdminOrgMembership"("organizationId", "role");

ALTER TABLE "AdminOrgMembership" ADD CONSTRAINT "AdminOrgMembership_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed: non–Master Admin users get the same role for both orgs (matches previous global role behavior).
INSERT INTO "AdminOrgMembership" ("id", "adminUserId", "organizationId", "role", "createdAt", "updatedAt")
SELECT replace(gen_random_uuid()::text, '-', ''),
       id,
       'gonzales',
       role,
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
FROM "AdminUser"
WHERE "isMaster" = false;

INSERT INTO "AdminOrgMembership" ("id", "adminUserId", "organizationId", "role", "createdAt", "updatedAt")
SELECT replace(gen_random_uuid()::text, '-', ''),
       id,
       'ascension',
       role,
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
FROM "AdminUser"
WHERE "isMaster" = false;
