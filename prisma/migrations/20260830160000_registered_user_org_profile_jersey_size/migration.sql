-- Coach/volunteer staff shirt size, per (person, org) profile — populated
-- only when a volunteer-registration export includes a size question.
ALTER TABLE "RegisteredUserOrgProfile" ADD COLUMN "jerseySize" TEXT;
