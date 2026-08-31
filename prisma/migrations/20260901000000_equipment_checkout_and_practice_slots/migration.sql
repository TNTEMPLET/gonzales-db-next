-- CreateTable
CREATE TABLE "EquipmentCheckout" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "ageGroup" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "assignedCoachId" TEXT,
    "kitLabel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "pickedUpAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentCheckout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamPracticeSlot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "ageGroup" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "parkId" TEXT,
    "fieldId" TEXT,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 90,
    "sharedFieldGroupId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamPracticeSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentCheckout_teamId_key" ON "EquipmentCheckout"("teamId");

-- CreateIndex
CREATE INDEX "EquipmentCheckout_organizationId_seasonYear_ageGroup_idx" ON "EquipmentCheckout"("organizationId", "seasonYear", "ageGroup");

-- CreateIndex
CREATE INDEX "EquipmentCheckout_status_idx" ON "EquipmentCheckout"("status");

-- CreateIndex
CREATE INDEX "TeamPracticeSlot_organizationId_seasonYear_ageGroup_idx" ON "TeamPracticeSlot"("organizationId", "seasonYear", "ageGroup");

-- CreateIndex
CREATE INDEX "TeamPracticeSlot_sharedFieldGroupId_idx" ON "TeamPracticeSlot"("sharedFieldGroupId");

-- AddForeignKey
ALTER TABLE "EquipmentCheckout" ADD CONSTRAINT "EquipmentCheckout_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPracticeSlot" ADD CONSTRAINT "TeamPracticeSlot_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPracticeSlot" ADD CONSTRAINT "TeamPracticeSlot_parkId_fkey" FOREIGN KEY ("parkId") REFERENCES "SchedulePark"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPracticeSlot" ADD CONSTRAINT "TeamPracticeSlot_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "ScheduleField"("id") ON DELETE SET NULL ON UPDATE CASCADE;
