-- CreateIndex
CREATE INDEX "VolunteerRoleAssignment_teamId_idx" ON "VolunteerRoleAssignment"("teamId");

-- AddForeignKey
ALTER TABLE "VolunteerRoleAssignment" ADD CONSTRAINT "VolunteerRoleAssignment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
