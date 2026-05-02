-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN "googleSub" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_googleSub_key" ON "AdminUser"("googleSub");
