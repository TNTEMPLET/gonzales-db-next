-- CreateEnum
CREATE TYPE "SocialPostStatus" AS ENUM ('DRAFT', 'PUBLISHING', 'PUBLISHED', 'FAILED');

-- CreateTable
CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'gonzales',
    "status" "SocialPostStatus" NOT NULL DEFAULT 'DRAFT',
    "body" TEXT NOT NULL,
    "linkUrl" TEXT,
    "imageUrl" TEXT,
    "facebookPostId" TEXT,
    "publishError" TEXT,
    "publishedAt" TIMESTAMP(3),
    "scheduledFor" TIMESTAMP(3),
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialPost_organizationId_status_updatedAt_idx" ON "SocialPost"("organizationId", "status", "updatedAt");

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
