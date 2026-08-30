-- Enrollment: durable source of truth for SportsConnect registration rows
-- (demographics + team assignment + financial order data). Additive only —
-- TeamPlayer is unchanged and remains the roster projection.

CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "sportsConnectRowKey" TEXT NOT NULL,
    "programName" TEXT,
    "divisionNameRaw" TEXT,
    "ageGroup" TEXT NOT NULL,
    "teamNameRaw" TEXT,
    "teamId" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "fullName" TEXT NOT NULL,
    "gender" TEXT,
    "birthDate" TIMESTAMP(3),
    "guardianFirstName" TEXT,
    "guardianLastName" TEXT,
    "guardianEmail" TEXT,
    "guardianPhone" TEXT,
    "contactPhone" TEXT,
    "streetAddress" TEXT,
    "unit" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "sportsConnectOrderNo" TEXT,
    "orderDate" TIMESTAMP(3),
    "orderDetailDescription" TEXT,
    "orderPaymentStatus" TEXT,
    "amountCents" INTEGER,
    "amountPaidCents" INTEGER,
    "balanceCents" INTEGER,
    "rawRow" JSONB NOT NULL,
    "importRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Enrollment_organizationId_seasonYear_sportsConnectRowKey_key" ON "Enrollment"("organizationId", "seasonYear", "sportsConnectRowKey");

CREATE INDEX "Enrollment_organizationId_seasonYear_ageGroup_idx" ON "Enrollment"("organizationId", "seasonYear", "ageGroup");

CREATE INDEX "Enrollment_organizationId_seasonYear_teamId_idx" ON "Enrollment"("organizationId", "seasonYear", "teamId");

CREATE INDEX "Enrollment_organizationId_seasonYear_sportsConnectOrderNo_idx" ON "Enrollment"("organizationId", "seasonYear", "sportsConnectOrderNo");

CREATE INDEX "Enrollment_guardianEmail_idx" ON "Enrollment"("guardianEmail");

ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "SportsConnectImportRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
