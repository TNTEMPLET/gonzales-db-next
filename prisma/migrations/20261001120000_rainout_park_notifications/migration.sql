-- CreateTable
CREATE TABLE "RainoutParkNotification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "calendarDate" TEXT NOT NULL,
    "parkKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RainoutParkNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RainoutParkNotification_organizationId_calendarDate_parkKey_key" ON "RainoutParkNotification"("organizationId", "calendarDate", "parkKey");

-- CreateIndex
CREATE INDEX "RainoutParkNotification_organizationId_calendarDate_idx" ON "RainoutParkNotification"("organizationId", "calendarDate");

-- NOTE: Postgres requires ADD VALUE outside a transaction for existing types.
ALTER TYPE "CommunicationDeliveryStatus" ADD VALUE IF NOT EXISTS 'SKIPPED_DRY_RUN';
ALTER TYPE "CommunicationDeliveryStatus" ADD VALUE IF NOT EXISTS 'SKIPPED_ALLOWLIST';
