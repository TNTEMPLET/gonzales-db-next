-- Global identity refactor for RegisteredUser (Parent + OrgProfile children)
-- 2026-07-29

-- 1. Create the new per-org profile table (the "child")
CREATE TABLE "RegisteredUserOrgProfile" (
    "id" TEXT NOT NULL,
    "registeredUserId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "isCoach" BOOLEAN NOT NULL DEFAULT false,
    "ageGroup" TEXT,
    "assignedTeam" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegisteredUserOrgProfile_pkey" PRIMARY KEY ("id")
);

-- 2. Add FK + indexes on the profile table
ALTER TABLE "RegisteredUserOrgProfile" ADD CONSTRAINT "RegisteredUserOrgProfile_registeredUserId_fkey"
    FOREIGN KEY ("registeredUserId") REFERENCES "RegisteredUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "RegisteredUserOrgProfile_registeredUserId_organizationId_key"
    ON "RegisteredUserOrgProfile"("registeredUserId", "organizationId");

CREATE INDEX "RegisteredUserOrgProfile_organizationId_idx"
    ON "RegisteredUserOrgProfile"("organizationId");

CREATE INDEX "RegisteredUserOrgProfile_registeredUserId_idx"
    ON "RegisteredUserOrgProfile"("registeredUserId");

-- 3. Backfill: Create one global RegisteredUser per distinct email (preferring rows that have a googleSub).
--    Then create one OrgProfile row for every (org, email) pair that existed.

-- First, ensure we have a global row for every email that appears.
-- We do this by grouping existing rows by email, picking the "best" one (has googleSub, or most recent).
INSERT INTO "RegisteredUser" ("id", "email", "name", "firstName", "lastName", "isBlocked", "contactPhone", "googleSub", "passwordHash", "avatarUrl",
  "abuseAwarenessTrainingCertificateUrl", "abuseAwarenessTrainingCertificateFileName",
  "abuseAwarenessTrainingCertificateMimeType", "abuseAwarenessTrainingCertificateUploadedAt",
  "duplicateReviewPending", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text AS id,
    lower(trim(e.email)) AS email,
    (array_agg(e.name ORDER BY (e.googleSub IS NOT NULL) DESC, e."updatedAt" DESC))[1] AS name,
    (array_agg(e."firstName" ORDER BY (e.googleSub IS NOT NULL) DESC, e."updatedAt" DESC))[1] AS "firstName",
    (array_agg(e."lastName" ORDER BY (e.googleSub IS NOT NULL) DESC, e."updatedAt" DESC))[1] AS "lastName",
    bool_or(e."isBlocked") AS "isBlocked",
    (array_agg(e."contactPhone" ORDER BY (e.googleSub IS NOT NULL) DESC, e."updatedAt" DESC))[1] AS "contactPhone",
    (array_agg(e."googleSub" ORDER BY (e.googleSub IS NOT NULL) DESC, e."updatedAt" DESC) FILTER (WHERE e."googleSub" IS NOT NULL))[1] AS "googleSub",
    (array_agg(e."passwordHash" ORDER BY (e.googleSub IS NOT NULL) DESC, e."updatedAt" DESC))[1] AS "passwordHash",
    (array_agg(e."avatarUrl" ORDER BY (e.googleSub IS NOT NULL) DESC, e."updatedAt" DESC))[1] AS "avatarUrl",
    (array_agg(e."abuseAwarenessTrainingCertificateUrl" ORDER BY (e.googleSub IS NOT NULL) DESC, e."updatedAt" DESC))[1] AS "abuseAwarenessTrainingCertificateUrl",
    (array_agg(e."abuseAwarenessTrainingCertificateFileName" ORDER BY (e.googleSub IS NOT NULL) DESC, e."updatedAt" DESC))[1] AS "abuseAwarenessTrainingCertificateFileName",
    (array_agg(e."abuseAwarenessTrainingCertificateMimeType" ORDER BY (e.googleSub IS NOT NULL) DESC, e."updatedAt" DESC))[1] AS "abuseAwarenessTrainingCertificateMimeType",
    (array_agg(e."abuseAwarenessTrainingCertificateUploadedAt" ORDER BY (e.googleSub IS NOT NULL) DESC, e."updatedAt" DESC))[1] AS "abuseAwarenessTrainingCertificateUploadedAt",
    bool_or(e."duplicateReviewPending") AS "duplicateReviewPending",
    min(e."createdAt") AS "createdAt",
    max(e."updatedAt") AS "updatedAt"
FROM "RegisteredUser" e
WHERE e.email IS NOT NULL AND trim(e.email) <> ''
GROUP BY lower(trim(e.email))
ON CONFLICT ("email") DO NOTHING;

-- 4. Now create the OrgProfile rows for every distinct (global user, org) that existed.
--    We join back using email to find the global id we just created (or already had).
INSERT INTO "RegisteredUserOrgProfile" ("id", "registeredUserId", "organizationId", "isCoach", "ageGroup", "assignedTeam", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    ru.id,
    old."organizationId",
    bool_or(COALESCE(old."isCoach", false)) AS "isCoach",
    (array_agg(old."ageGroup" ORDER BY old."updatedAt" DESC))[1] AS "ageGroup",
    (array_agg(old."assignedTeam" ORDER BY old."updatedAt" DESC))[1] AS "assignedTeam",
    min(old."createdAt"),
    max(old."updatedAt")
FROM "RegisteredUser" old
JOIN "RegisteredUser" ru ON lower(trim(ru.email)) = lower(trim(old.email))
WHERE old."organizationId" IS NOT NULL
GROUP BY ru.id, old."organizationId"
ON CONFLICT ("registeredUserId", "organizationId") DO NOTHING;

-- 5. Drop old per-org uniqueness and the organizationId column from the main table.
--    We keep googleSub unique (it already is).
DROP INDEX IF EXISTS "RegisteredUser_organizationId_email_key";
DROP INDEX IF EXISTS "RegisteredUser_organizationId_idx";
DROP INDEX IF EXISTS "RegisteredUser_organizationId_duplicateReviewPending_idx";

-- Remove the column (data is now in profiles).
ALTER TABLE "RegisteredUser" DROP COLUMN IF EXISTS "organizationId";
ALTER TABLE "RegisteredUser" DROP COLUMN IF EXISTS "isCoach";
ALTER TABLE "RegisteredUser" DROP COLUMN IF EXISTS "ageGroup";
ALTER TABLE "RegisteredUser" DROP COLUMN IF EXISTS "assignedTeam";

-- 6. Add the new global email uniqueness (if not already present from model).
--    Prisma will manage the final state; this is defensive.
CREATE UNIQUE INDEX IF NOT EXISTS "RegisteredUser_email_key" ON "RegisteredUser"("email");

-- Note: After this migration, run the collapse backfill script if needed.
-- Then run `prisma generate`.
