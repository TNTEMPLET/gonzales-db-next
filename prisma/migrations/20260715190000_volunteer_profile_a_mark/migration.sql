-- Opaque badge mark for Master Admin toggle (no public semantics).
ALTER TABLE "VolunteerProfile" ADD COLUMN IF NOT EXISTS "aMark" BOOLEAN NOT NULL DEFAULT false;
