-- CreateTable
CREATE TABLE "SeasonOrgSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "parishRegistrationFeeCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeasonOrgSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeasonOrgSettings_organizationId_seasonYear_idx" ON "SeasonOrgSettings"("organizationId", "seasonYear");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonOrgSettings_organizationId_seasonYear_key" ON "SeasonOrgSettings"("organizationId", "seasonYear");
