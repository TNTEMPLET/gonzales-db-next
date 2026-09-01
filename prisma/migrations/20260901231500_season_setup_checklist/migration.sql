-- CreateTable
CREATE TABLE "SeasonSetupChecklistItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "itemKey" TEXT NOT NULL,
    "ageGroup" TEXT NOT NULL DEFAULT '',
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "completedByAdminId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeasonSetupChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeasonSetupChecklistItem_organizationId_seasonYear_idx" ON "SeasonSetupChecklistItem"("organizationId", "seasonYear");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonSetupChecklistItem_organizationId_seasonYear_itemKey__key" ON "SeasonSetupChecklistItem"("organizationId", "seasonYear", "itemKey", "ageGroup");
