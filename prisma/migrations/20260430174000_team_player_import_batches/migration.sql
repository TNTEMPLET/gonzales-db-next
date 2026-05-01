-- CreateTable
CREATE TABLE "TeamPlayerImportBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByAdminId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "createdTeams" INTEGER NOT NULL DEFAULT 0,
    "createdPlayers" INTEGER NOT NULL DEFAULT 0,
    "updatedPlayers" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "undoPayload" JSONB NOT NULL,
    "completedAt" TIMESTAMP(3),
    "undoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamPlayerImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamPlayerImportBatch_organizationId_createdAt_idx" ON "TeamPlayerImportBatch"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "TeamPlayerImportBatch_organizationId_status_createdAt_idx" ON "TeamPlayerImportBatch"("organizationId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "TeamPlayerImportBatch" ADD CONSTRAINT "TeamPlayerImportBatch_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
