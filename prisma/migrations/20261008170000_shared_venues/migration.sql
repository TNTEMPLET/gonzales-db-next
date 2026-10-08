-- Shared physical parks. Additive only: a new table and a nullable foreign key.
-- No backfill. Exact-name links are applied later by scripts/venues/prefill-venues.ts.

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "normalizedName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Venue_normalizedName_key" ON "Venue"("normalizedName");

-- CreateIndex
CREATE INDEX "Venue_isActive_name_idx" ON "Venue"("isActive", "name");

-- AlterTable
ALTER TABLE "SchedulePark" ADD COLUMN "venueId" TEXT;

-- CreateIndex
CREATE INDEX "SchedulePark_venueId_idx" ON "SchedulePark"("venueId");

-- AddForeignKey
ALTER TABLE "SchedulePark" ADD CONSTRAINT "SchedulePark_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
