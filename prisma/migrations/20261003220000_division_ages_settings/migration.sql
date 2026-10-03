-- AlterTable
ALTER TABLE "SeasonOrgSettings" ADD COLUMN "divisionAgesJson" JSONB;

-- CreateTable
CREATE TABLE "LeagueAgeDivisionDefaults" (
    "organizationId" TEXT NOT NULL,
    "cutoffMonth" INTEGER NOT NULL,
    "cutoffDay" INTEGER NOT NULL,
    "yearOffset" INTEGER NOT NULL DEFAULT 0,
    "divisionsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByAdminId" TEXT,

    CONSTRAINT "LeagueAgeDivisionDefaults_pkey" PRIMARY KEY ("organizationId")
);
