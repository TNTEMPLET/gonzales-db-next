CREATE TYPE "GameChangerScoreboardSourceType" AS ENUM ('LEAGUE', 'TOURNAMENT');

CREATE TABLE "GameChangerScoreboardConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "sourceType" "GameChangerScoreboardSourceType" NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceLabel" TEXT,
    "widgetId" TEXT NOT NULL,
    "maxVerticalGamesVisible" INTEGER,
    "autoImportFinalScores" BOOLEAN NOT NULL DEFAULT true,
    "importedFinalEventIds" JSONB NOT NULL DEFAULT [],
    "matchEventPins" JSONB NOT NULL DEFAULT {},
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GameChangerScoreboardConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GameChangerScoreboardConnection_org_season_source_key" ON "GameChangerScoreboardConnection"("organizationId", "seasonYear", "sourceType", "sourceKey");
CREATE INDEX "GameChangerScoreboardConnection_org_season_source_idx" ON "GameChangerScoreboardConnection"("organizationId", "seasonYear", "sourceType");
CREATE INDEX "GameChangerScoreboardConnection_source_key_idx" ON "GameChangerScoreboardConnection"("sourceType", "sourceKey");
CREATE INDEX "GameChangerScoreboardConnection_createdByAdminId_idx" ON "GameChangerScoreboardConnection"("createdByAdminId");
ALTER TABLE "GameChangerScoreboardConnection" ADD CONSTRAINT "GameChangerScoreboardConnection_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
