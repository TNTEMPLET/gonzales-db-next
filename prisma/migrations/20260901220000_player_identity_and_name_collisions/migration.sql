-- AlterTable
ALTER TABLE "TeamPlayer" ADD COLUMN "sportsConnectPlayerId" TEXT;

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN "sportsConnectPlayerId" TEXT;

-- CreateIndex
CREATE INDEX "TeamPlayer_sportsConnectPlayerId_idx" ON "TeamPlayer"("sportsConnectPlayerId");

-- CreateIndex
CREATE INDEX "Enrollment_sportsConnectPlayerId_idx" ON "Enrollment"("sportsConnectPlayerId");

-- CreateTable
CREATE TABLE "PlayerNameCollisionReview" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "ageGroup" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "findingType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reviewedTeamPlayerIds" TEXT[],
    "reviewedEnrollmentIds" TEXT[],
    "reviewedByAdminId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerNameCollisionReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerNameCollisionReview_organizationId_seasonYear_status_idx" ON "PlayerNameCollisionReview"("organizationId", "seasonYear", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerNameCollisionReview_organizationId_seasonYear_ageGrou_key" ON "PlayerNameCollisionReview"("organizationId", "seasonYear", "ageGroup", "normalizedName", "findingType");
