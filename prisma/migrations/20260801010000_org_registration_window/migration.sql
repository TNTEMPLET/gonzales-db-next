-- CreateTable
CREATE TABLE IF NOT EXISTS "OrgRegistrationWindow" (
    "organizationId" TEXT NOT NULL,
    "startLocal" TEXT NOT NULL,
    "endLocal" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByAdminId" TEXT,

    CONSTRAINT "OrgRegistrationWindow_pkey" PRIMARY KEY ("organizationId")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrgRegistrationWindow_updatedAt_idx" ON "OrgRegistrationWindow"("updatedAt");

-- Seed defaults (Central wall-clock strings; match previous hardcoded windows)
INSERT INTO "OrgRegistrationWindow" ("organizationId", "startLocal", "endLocal", "updatedAt")
VALUES
  ('fallball', '2026-08-01T00:00:00', '2026-11-30T23:59:59', CURRENT_TIMESTAMP),
  ('gonzales', '2025-12-20T00:00:00', '2026-01-01T23:59:59', CURRENT_TIMESTAMP),
  ('ascension', '2025-12-20T00:00:00', '2026-01-01T23:59:59', CURRENT_TIMESTAMP)
ON CONFLICT ("organizationId") DO NOTHING;
