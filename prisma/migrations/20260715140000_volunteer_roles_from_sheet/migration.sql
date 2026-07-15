-- Align VolunteerRole enum with Sports Connect volunteer registration sheet.
-- Does not create/delete users; only remaps existing role assignment enum values.

CREATE TYPE "VolunteerRole_new" AS ENUM (
  'LEAGUE_HEAD_COACH',
  'LEAGUE_ASSISTANT_COACH',
  'HEAD_COACH',
  'AP_BASEBALL_UMPIRE',
  'OTHER_AP_POSITIONS'
);

ALTER TABLE "VolunteerRoleAssignment"
  ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "VolunteerRoleAssignment"
  ALTER COLUMN "role" TYPE "VolunteerRole_new"
  USING (
    CASE "role"::text
      WHEN 'HEAD_COACH' THEN 'LEAGUE_HEAD_COACH'::"VolunteerRole_new"
      WHEN 'ASSISTANT_COACH' THEN 'LEAGUE_ASSISTANT_COACH'::"VolunteerRole_new"
      WHEN 'TEAM_PARENT' THEN 'OTHER_AP_POSITIONS'::"VolunteerRole_new"
      WHEN 'BOARD' THEN 'OTHER_AP_POSITIONS'::"VolunteerRole_new"
      WHEN 'OTHER' THEN 'OTHER_AP_POSITIONS'::"VolunteerRole_new"
      WHEN 'LEAGUE_HEAD_COACH' THEN 'LEAGUE_HEAD_COACH'::"VolunteerRole_new"
      WHEN 'LEAGUE_ASSISTANT_COACH' THEN 'LEAGUE_ASSISTANT_COACH'::"VolunteerRole_new"
      WHEN 'AP_BASEBALL_UMPIRE' THEN 'AP_BASEBALL_UMPIRE'::"VolunteerRole_new"
      WHEN 'OTHER_AP_POSITIONS' THEN 'OTHER_AP_POSITIONS'::"VolunteerRole_new"
      ELSE 'OTHER_AP_POSITIONS'::"VolunteerRole_new"
    END
  );

DROP TYPE "VolunteerRole";
ALTER TYPE "VolunteerRole_new" RENAME TO "VolunteerRole";
