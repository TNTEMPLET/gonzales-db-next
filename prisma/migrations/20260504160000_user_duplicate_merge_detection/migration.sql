-- AlterEnum
ALTER TYPE "AdminAuditAction" ADD VALUE IF NOT EXISTS 'MERGE_USERS';

-- CreateEnum
CREATE TYPE "RegisteredUserDuplicateMatchReason" AS ENUM ('NAME_NORMALIZED');

-- CreateEnum
CREATE TYPE "RegisteredUserDuplicateStatus" AS ENUM ('PENDING', 'DISMISSED', 'MERGED');

-- AlterTable
ALTER TABLE "RegisteredUser" ADD COLUMN "duplicateReviewPending" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "RegisteredUser_organizationId_duplicateReviewPending_idx" ON "RegisteredUser"("organizationId", "duplicateReviewPending");

-- CreateTable
CREATE TABLE "RegisteredUserDuplicateCandidate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "newerUserId" TEXT NOT NULL,
    "candidateUserId" TEXT NOT NULL,
    "matchReason" "RegisteredUserDuplicateMatchReason" NOT NULL DEFAULT 'NAME_NORMALIZED',
    "status" "RegisteredUserDuplicateStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "RegisteredUserDuplicateCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegisteredUserDuplicateCandidate_newerUserId_candidateUserId_key" ON "RegisteredUserDuplicateCandidate"("newerUserId", "candidateUserId");

-- CreateIndex
CREATE INDEX "RegisteredUserDuplicateCandidate_organizationId_status_idx" ON "RegisteredUserDuplicateCandidate"("organizationId", "status");

-- CreateIndex
CREATE INDEX "RegisteredUserDuplicateCandidate_newerUserId_status_idx" ON "RegisteredUserDuplicateCandidate"("newerUserId", "status");

-- AddForeignKey
ALTER TABLE "RegisteredUserDuplicateCandidate" ADD CONSTRAINT "RegisteredUserDuplicateCandidate_newerUserId_fkey" FOREIGN KEY ("newerUserId") REFERENCES "RegisteredUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegisteredUserDuplicateCandidate" ADD CONSTRAINT "RegisteredUserDuplicateCandidate_candidateUserId_fkey" FOREIGN KEY ("candidateUserId") REFERENCES "RegisteredUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
