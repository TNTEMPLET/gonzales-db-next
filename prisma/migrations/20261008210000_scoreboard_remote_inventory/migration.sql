-- Scoreboard remote inventory. Additive only: new enums and tables.
-- ScheduleDraftGame.scoreboard* columns are left in place as history.
-- No data writes.

-- CreateEnum
CREATE TYPE "ScoreboardControllerStatus" AS ENUM ('ACTIVE', 'MISSING', 'REPAIR', 'RETIRED');

-- CreateEnum
CREATE TYPE "ScoreboardCheckoutSide" AS ENUM ('HOME', 'AWAY');

-- CreateTable
CREATE TABLE "ScoreboardController" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "homeFieldName" TEXT,
    "status" "ScoreboardControllerStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoreboardController_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreboardCheckout" (
    "id" TEXT NOT NULL,
    "controllerId" TEXT NOT NULL,
    "scheduleDraftGameId" TEXT,
    "organizationId" TEXT NOT NULL,
    "side" "ScoreboardCheckoutSide" NOT NULL,
    "volunteerName" TEXT NOT NULL,
    "checkedOutAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedOutByAdminId" TEXT,
    "checkedInAt" TIMESTAMP(3),
    "checkedInByAdminId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoreboardCheckout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScoreboardController_venueId_status_idx" ON "ScoreboardController"("venueId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreboardController_venueId_label_key" ON "ScoreboardController"("venueId", "label");

-- CreateIndex
CREATE INDEX "ScoreboardCheckout_controllerId_idx" ON "ScoreboardCheckout"("controllerId");

-- CreateIndex
CREATE INDEX "ScoreboardCheckout_scheduleDraftGameId_idx" ON "ScoreboardCheckout"("scheduleDraftGameId");

-- CreateIndex
CREATE INDEX "ScoreboardCheckout_organizationId_idx" ON "ScoreboardCheckout"("organizationId");

-- CreateIndex
CREATE INDEX "ScoreboardCheckout_checkedOutByAdminId_idx" ON "ScoreboardCheckout"("checkedOutByAdminId");

-- CreateIndex
CREATE INDEX "ScoreboardCheckout_checkedInByAdminId_idx" ON "ScoreboardCheckout"("checkedInByAdminId");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreboardCheckout_one_open_controller_idx" ON "ScoreboardCheckout"("controllerId") WHERE ("checkedInAt" IS NULL);

-- AddForeignKey
ALTER TABLE "ScoreboardController" ADD CONSTRAINT "ScoreboardController_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreboardCheckout" ADD CONSTRAINT "ScoreboardCheckout_controllerId_fkey" FOREIGN KEY ("controllerId") REFERENCES "ScoreboardController"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreboardCheckout" ADD CONSTRAINT "ScoreboardCheckout_scheduleDraftGameId_fkey" FOREIGN KEY ("scheduleDraftGameId") REFERENCES "ScheduleDraftGame"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreboardCheckout" ADD CONSTRAINT "ScoreboardCheckout_checkedOutByAdminId_fkey" FOREIGN KEY ("checkedOutByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreboardCheckout" ADD CONSTRAINT "ScoreboardCheckout_checkedInByAdminId_fkey" FOREIGN KEY ("checkedInByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
