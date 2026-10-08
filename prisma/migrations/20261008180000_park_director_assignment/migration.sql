-- Park directors belong to a physical park (Venue), shared by every league.
-- Additive only: a new table. No changes to existing columns and no data writes.

-- CreateTable
CREATE TABLE "ParkDirectorAssignment" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "assignedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParkDirectorAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ParkDirectorAssignment_adminUserId_venueId_key" ON "ParkDirectorAssignment"("adminUserId", "venueId");

-- CreateIndex
CREATE INDEX "ParkDirectorAssignment_adminUserId_active_idx" ON "ParkDirectorAssignment"("adminUserId", "active");

-- CreateIndex
CREATE INDEX "ParkDirectorAssignment_venueId_active_idx" ON "ParkDirectorAssignment"("venueId", "active");

-- CreateIndex
CREATE INDEX "ParkDirectorAssignment_assignedByAdminId_idx" ON "ParkDirectorAssignment"("assignedByAdminId");

-- AddForeignKey
ALTER TABLE "ParkDirectorAssignment" ADD CONSTRAINT "ParkDirectorAssignment_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkDirectorAssignment" ADD CONSTRAINT "ParkDirectorAssignment_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkDirectorAssignment" ADD CONSTRAINT "ParkDirectorAssignment_assignedByAdminId_fkey" FOREIGN KEY ("assignedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
