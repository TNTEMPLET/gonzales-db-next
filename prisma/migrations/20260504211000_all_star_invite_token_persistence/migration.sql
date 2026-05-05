-- AlterTable
ALTER TABLE "AllStarInvite" ADD COLUMN "inviteToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AllStarInvite_inviteToken_key" ON "AllStarInvite"("inviteToken");
