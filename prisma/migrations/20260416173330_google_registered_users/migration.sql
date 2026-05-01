-- CreateTable
CREATE TABLE "RegisteredUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "googleSub" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- AlterTable
ALTER TABLE "AdminUser"
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "RegisteredUser_email_key" ON "RegisteredUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RegisteredUser_googleSub_key" ON "RegisteredUser"("googleSub");
