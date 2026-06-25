-- Draft scheduler schema for Fall Ball scheduling and future multi-org expansion.
CREATE TYPE "ScheduleSeasonStatus" AS ENUM (
  'DRAFT',
  'ACTIVE',
  'LOCKED',
  'ARCHIVED'
);

CREATE TYPE "ScheduleAvailabilityType" AS ENUM (
  'AVAILABLE',
  'BLACKOUT'
);

CREATE TYPE "ScheduleDraftGameStatus" AS ENUM (
  'DRAFT',
  'READY',
  'CONFLICT',
  'LOCKED',
  'EXPORTED',
  'CANCELED'
);

CREATE TYPE "ScheduleExportBatchStatus" AS ENUM (
  'PENDING',
  'COMPLETED',
  'FAILED'
);

CREATE TABLE "ScheduleSeason" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "seasonYear" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "status" "ScheduleSeasonStatus" NOT NULL DEFAULT 'DRAFT',
  "startsOn" TIMESTAMP(3),
  "endsOn" TIMESTAMP(3),
  "defaultGameTimes" JSONB NOT NULL DEFAULT '[]',
  "settings" JSONB NOT NULL DEFAULT '{}',
  "createdByAdminId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ScheduleSeason_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SchedulePark" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "shortName" TEXT,
  "address" TEXT,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SchedulePark_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScheduleField" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "parkId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "shortName" TEXT,
  "supportedAgeGroups" JSONB NOT NULL DEFAULT '[]',
  "supportedDivisions" JSONB NOT NULL DEFAULT '[]',
  "fieldMetadata" JSONB NOT NULL DEFAULT '{}',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ScheduleField_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScheduleFieldAvailability" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "seasonId" TEXT,
  "parkId" TEXT NOT NULL,
  "fieldId" TEXT,
  "availabilityType" "ScheduleAvailabilityType" NOT NULL DEFAULT 'AVAILABLE',
  "date" TIMESTAMP(3),
  "dayOfWeek" INTEGER,
  "startTime" TEXT,
  "endTime" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ScheduleFieldAvailability_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScheduleDivisionRule" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "seasonId" TEXT NOT NULL,
  "division" TEXT NOT NULL,
  "ageGroup" TEXT,
  "preferredParkId" TEXT,
  "preferredFieldId" TEXT,
  "allowedParkIds" JSONB NOT NULL DEFAULT '[]',
  "allowedFieldIds" JSONB NOT NULL DEFAULT '[]',
  "allowedGameTimes" JSONB NOT NULL DEFAULT '[]',
  "minDaysBetweenGames" INTEGER,
  "maxGamesPerWeek" INTEGER,
  "avoidBackToBack" BOOLEAN NOT NULL DEFAULT true,
  "ruleMetadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ScheduleDivisionRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScheduleDraftGame" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "seasonId" TEXT NOT NULL,
  "gameDate" TIMESTAMP(3),
  "startTime" TEXT,
  "endTime" TEXT,
  "parkId" TEXT,
  "fieldId" TEXT,
  "division" TEXT NOT NULL,
  "ageGroup" TEXT,
  "homeTeamId" TEXT,
  "awayTeamId" TEXT,
  "homeTeamName" TEXT NOT NULL,
  "awayTeamName" TEXT NOT NULL,
  "status" "ScheduleDraftGameStatus" NOT NULL DEFAULT 'DRAFT',
  "source" TEXT NOT NULL DEFAULT 'generated',
  "roundLabel" TEXT,
  "gameNumber" INTEGER,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "conflictFlags" JSONB NOT NULL DEFAULT '[]',
  "fairnessScore" DOUBLE PRECISION,
  "fairnessMetadata" JSONB NOT NULL DEFAULT '{}',
  "schedulerNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ScheduleDraftGame_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScheduleExportBatch" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "seasonId" TEXT NOT NULL,
  "status" "ScheduleExportBatchStatus" NOT NULL DEFAULT 'PENDING',
  "format" TEXT NOT NULL DEFAULT 'CSV',
  "exportedGameIds" JSONB NOT NULL DEFAULT '[]',
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "fileUrl" TEXT,
  "notes" TEXT,
  "createdByAdminId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "ScheduleExportBatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScheduleSeason_organizationId_seasonYear_name_key"
  ON "ScheduleSeason"("organizationId", "seasonYear", "name");
CREATE INDEX "ScheduleSeason_organizationId_status_seasonYear_idx"
  ON "ScheduleSeason"("organizationId", "status", "seasonYear");
CREATE INDEX "ScheduleSeason_organizationId_updatedAt_idx"
  ON "ScheduleSeason"("organizationId", "updatedAt");
CREATE INDEX "ScheduleSeason_createdByAdminId_idx"
  ON "ScheduleSeason"("createdByAdminId");

CREATE UNIQUE INDEX "SchedulePark_organizationId_name_key"
  ON "SchedulePark"("organizationId", "name");
CREATE INDEX "SchedulePark_organizationId_isActive_name_idx"
  ON "SchedulePark"("organizationId", "isActive", "name");

CREATE UNIQUE INDEX "ScheduleField_parkId_name_key"
  ON "ScheduleField"("parkId", "name");
CREATE INDEX "ScheduleField_organizationId_isActive_idx"
  ON "ScheduleField"("organizationId", "isActive");
CREATE INDEX "ScheduleField_parkId_isActive_name_idx"
  ON "ScheduleField"("parkId", "isActive", "name");

CREATE INDEX "SchedAvail_org_season_type_idx"
  ON "ScheduleFieldAvailability"("organizationId", "seasonId", "availabilityType");
CREATE INDEX "ScheduleFieldAvailability_parkId_date_idx"
  ON "ScheduleFieldAvailability"("parkId", "date");
CREATE INDEX "ScheduleFieldAvailability_fieldId_date_idx"
  ON "ScheduleFieldAvailability"("fieldId", "date");
CREATE INDEX "SchedAvail_org_day_start_idx"
  ON "ScheduleFieldAvailability"("organizationId", "dayOfWeek", "startTime");

CREATE INDEX "ScheduleDivisionRule_organizationId_seasonId_division_idx"
  ON "ScheduleDivisionRule"("organizationId", "seasonId", "division");
CREATE INDEX "ScheduleDivisionRule_preferredParkId_idx"
  ON "ScheduleDivisionRule"("preferredParkId");
CREATE INDEX "ScheduleDivisionRule_preferredFieldId_idx"
  ON "ScheduleDivisionRule"("preferredFieldId");

CREATE INDEX "SchedDraftGame_org_season_status_date_idx"
  ON "ScheduleDraftGame"("organizationId", "seasonId", "status", "gameDate");
CREATE INDEX "ScheduleDraftGame_seasonId_division_gameDate_idx"
  ON "ScheduleDraftGame"("seasonId", "division", "gameDate");
CREATE INDEX "ScheduleDraftGame_parkId_gameDate_startTime_idx"
  ON "ScheduleDraftGame"("parkId", "gameDate", "startTime");
CREATE INDEX "ScheduleDraftGame_fieldId_gameDate_startTime_idx"
  ON "ScheduleDraftGame"("fieldId", "gameDate", "startTime");
CREATE INDEX "ScheduleDraftGame_homeTeamId_gameDate_idx"
  ON "ScheduleDraftGame"("homeTeamId", "gameDate");
CREATE INDEX "ScheduleDraftGame_awayTeamId_gameDate_idx"
  ON "ScheduleDraftGame"("awayTeamId", "gameDate");

CREATE INDEX "SchedExportBatch_org_season_created_idx"
  ON "ScheduleExportBatch"("organizationId", "seasonId", "createdAt");
CREATE INDEX "ScheduleExportBatch_seasonId_status_createdAt_idx"
  ON "ScheduleExportBatch"("seasonId", "status", "createdAt");
CREATE INDEX "ScheduleExportBatch_createdByAdminId_idx"
  ON "ScheduleExportBatch"("createdByAdminId");

ALTER TABLE "ScheduleSeason"
  ADD CONSTRAINT "ScheduleSeason_createdByAdminId_fkey"
  FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ScheduleField"
  ADD CONSTRAINT "ScheduleField_parkId_fkey"
  FOREIGN KEY ("parkId") REFERENCES "SchedulePark"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScheduleFieldAvailability"
  ADD CONSTRAINT "ScheduleFieldAvailability_seasonId_fkey"
  FOREIGN KEY ("seasonId") REFERENCES "ScheduleSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScheduleFieldAvailability"
  ADD CONSTRAINT "ScheduleFieldAvailability_parkId_fkey"
  FOREIGN KEY ("parkId") REFERENCES "SchedulePark"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScheduleFieldAvailability"
  ADD CONSTRAINT "ScheduleFieldAvailability_fieldId_fkey"
  FOREIGN KEY ("fieldId") REFERENCES "ScheduleField"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ScheduleDivisionRule"
  ADD CONSTRAINT "ScheduleDivisionRule_seasonId_fkey"
  FOREIGN KEY ("seasonId") REFERENCES "ScheduleSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScheduleDivisionRule"
  ADD CONSTRAINT "ScheduleDivisionRule_preferredParkId_fkey"
  FOREIGN KEY ("preferredParkId") REFERENCES "SchedulePark"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ScheduleDivisionRule"
  ADD CONSTRAINT "ScheduleDivisionRule_preferredFieldId_fkey"
  FOREIGN KEY ("preferredFieldId") REFERENCES "ScheduleField"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ScheduleDraftGame"
  ADD CONSTRAINT "ScheduleDraftGame_seasonId_fkey"
  FOREIGN KEY ("seasonId") REFERENCES "ScheduleSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScheduleDraftGame"
  ADD CONSTRAINT "ScheduleDraftGame_parkId_fkey"
  FOREIGN KEY ("parkId") REFERENCES "SchedulePark"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ScheduleDraftGame"
  ADD CONSTRAINT "ScheduleDraftGame_fieldId_fkey"
  FOREIGN KEY ("fieldId") REFERENCES "ScheduleField"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ScheduleDraftGame"
  ADD CONSTRAINT "ScheduleDraftGame_homeTeamId_fkey"
  FOREIGN KEY ("homeTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ScheduleDraftGame"
  ADD CONSTRAINT "ScheduleDraftGame_awayTeamId_fkey"
  FOREIGN KEY ("awayTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ScheduleExportBatch"
  ADD CONSTRAINT "ScheduleExportBatch_seasonId_fkey"
  FOREIGN KEY ("seasonId") REFERENCES "ScheduleSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScheduleExportBatch"
  ADD CONSTRAINT "ScheduleExportBatch_createdByAdminId_fkey"
  FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
