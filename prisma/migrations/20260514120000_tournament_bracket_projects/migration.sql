-- CreateEnum
CREATE TYPE "BracketProjectStatus" AS ENUM ('DRAFT', 'READY', 'ARCHIVED');

-- CreateTable
CREATE TABLE "GoverningBodyTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "governingBody" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "parserProfileId" TEXT,
    "fileUrl" TEXT NOT NULL,
    "fileMime" TEXT,
    "notes" TEXT,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoverningBodyTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BracketProject" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" "BracketProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "spec" JSONB NOT NULL DEFAULT '{}',
    "sourceArtifactUrls" JSONB NOT NULL DEFAULT '[]',
    "governingBodyTemplateId" TEXT,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BracketProject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GoverningBodyTemplate_organizationId_governingBody_idx" ON "GoverningBodyTemplate"("organizationId", "governingBody");

-- CreateIndex
CREATE INDEX "BracketProject_organizationId_status_updatedAt_idx" ON "BracketProject"("organizationId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "BracketProject_createdByAdminId_idx" ON "BracketProject"("createdByAdminId");

-- AddForeignKey
ALTER TABLE "GoverningBodyTemplate" ADD CONSTRAINT "GoverningBodyTemplate_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BracketProject" ADD CONSTRAINT "BracketProject_governingBodyTemplateId_fkey" FOREIGN KEY ("governingBodyTemplateId") REFERENCES "GoverningBodyTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BracketProject" ADD CONSTRAINT "BracketProject_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
