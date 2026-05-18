-- AlterTable
ALTER TABLE "BracketProject" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "BracketProject_organizationId_priority_idx" ON "BracketProject"("organizationId", "priority");
