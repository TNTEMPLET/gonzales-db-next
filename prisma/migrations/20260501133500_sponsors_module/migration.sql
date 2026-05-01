-- CreateEnum
CREATE TYPE "SponsorPackageType" AS ENUM (
  'BALLPARK_FENCE_SIGNS',
  'TEAM_SPONSORSHIPS',
  'FIELD_SPONSORSHIPS',
  'CUSTOM'
);

-- CreateTable
CREATE TABLE "Sponsor" (
  "id" TEXT NOT NULL,
  "businessName" TEXT NOT NULL,
  "contactName" TEXT,
  "contactEmail" TEXT,
  "contactPhone" TEXT,
  "websiteUrl" TEXT,
  "logoUrl" TEXT,
  "logoMimeType" TEXT,
  "logoAlt" TEXT,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "startAt" TIMESTAMP(3),
  "endAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Sponsor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorPackageEnrollment" (
  "id" TEXT NOT NULL,
  "sponsorId" TEXT NOT NULL,
  "packageType" "SponsorPackageType" NOT NULL,
  "packageLabel" TEXT NOT NULL,
  "minimumCommitmentCents" INTEGER,
  "amountCents" INTEGER,
  "additionalTeamAmountCents" INTEGER,
  "twoYearCommitmentAmountCents" INTEGER,
  "includesWebsiteLogo" BOOLEAN NOT NULL DEFAULT true,
  "includesSocialRecognition" BOOLEAN NOT NULL DEFAULT false,
  "includesUniformName" BOOLEAN NOT NULL DEFAULT false,
  "includesFieldSignage" BOOLEAN NOT NULL DEFAULT false,
  "includesSeasonScheduleName" BOOLEAN NOT NULL DEFAULT false,
  "includesAllStarMention" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SponsorPackageEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorPlacement" (
  "id" TEXT NOT NULL,
  "sponsorId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "showInFooterScroller" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 100,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SponsorPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Sponsor_businessName_idx" ON "Sponsor"("businessName");

-- CreateIndex
CREATE INDEX "Sponsor_isActive_startAt_endAt_idx" ON "Sponsor"("isActive", "startAt", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "SponsorPackageEnrollment_sponsorId_key" ON "SponsorPackageEnrollment"("sponsorId");

-- CreateIndex
CREATE UNIQUE INDEX "SponsorPlacement_sponsorId_organizationId_key" ON "SponsorPlacement"("sponsorId", "organizationId");

-- CreateIndex
CREATE INDEX "SponsorPlacement_organizationId_showInFooterScroller_sortOrder_idx" ON "SponsorPlacement"("organizationId", "showInFooterScroller", "sortOrder");

-- AddForeignKey
ALTER TABLE "SponsorPackageEnrollment"
ADD CONSTRAINT "SponsorPackageEnrollment_sponsorId_fkey"
FOREIGN KEY ("sponsorId") REFERENCES "Sponsor"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorPlacement"
ADD CONSTRAINT "SponsorPlacement_sponsorId_fkey"
FOREIGN KEY ("sponsorId") REFERENCES "Sponsor"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
