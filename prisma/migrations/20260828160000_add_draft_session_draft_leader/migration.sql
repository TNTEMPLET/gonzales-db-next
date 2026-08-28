-- AlterTable
ALTER TABLE "DraftSession" ADD COLUMN     "draftLeaderUserId" TEXT;

-- AddForeignKey
ALTER TABLE "DraftSession" ADD CONSTRAINT "DraftSession_draftLeaderUserId_fkey" FOREIGN KEY ("draftLeaderUserId") REFERENCES "RegisteredUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
