-- SportsConnect assisted import: mapping presets + audit runs

CREATE TABLE "SportsConnectMappingPreset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "reportKind" TEXT NOT NULL,
    "divisionMapping" JSONB NOT NULL,
    "teamMapping" JSONB NOT NULL,
    "columnOverrides" JSONB,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SportsConnectMappingPreset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SportsConnectImportRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "reportKind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREVIEW',
    "sourceFileName" TEXT,
    "presetId" TEXT,
    "summary" JSONB,
    "errorMessage" TEXT,
    "teamPlayerBatchId" TEXT,
    "coachBatchId" TEXT,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SportsConnectImportRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SportsConnectMappingPreset_organizationId_seasonYear_name_reportKind_key" ON "SportsConnectMappingPreset"("organizationId", "seasonYear", "name", "reportKind");

CREATE INDEX "SportsConnectMappingPreset_organizationId_seasonYear_idx" ON "SportsConnectMappingPreset"("organizationId", "seasonYear");

CREATE INDEX "SportsConnectImportRun_organizationId_seasonYear_createdAt_idx" ON "SportsConnectImportRun"("organizationId", "seasonYear", "createdAt");

CREATE INDEX "SportsConnectImportRun_organizationId_status_createdAt_idx" ON "SportsConnectImportRun"("organizationId", "status", "createdAt");

ALTER TABLE "SportsConnectMappingPreset" ADD CONSTRAINT "SportsConnectMappingPreset_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SportsConnectImportRun" ADD CONSTRAINT "SportsConnectImportRun_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
