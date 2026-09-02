-- AlterTable
ALTER TABLE "RegisteredUserOrgProfile" ADD COLUMN     "sportsConnectVolunteerId" TEXT,
ADD COLUMN     "sportsConnectVolunteerTypeId" TEXT;

-- CreateIndex
CREATE INDEX "RegisteredUserOrgProfile_sportsConnectVolunteerId_idx" ON "RegisteredUserOrgProfile"("sportsConnectVolunteerId");
