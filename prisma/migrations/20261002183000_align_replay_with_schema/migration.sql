-- Close the gap between a from-scratch replay and schema.prisma.
-- Captured from CI prisma migrate diff --from-config-datasource --to-schema
-- after bootstrap (Prisma 7.8, Postgres 17). Historical migration files are
-- left unchanged so checksums on databases that already applied them stay valid.
--
-- Idempotent: a database that already matches the schema (db push, or this
-- migration applied once) no-ops. Null venues are filled with an empty JSON
-- array before the column is required, which is the schema default.

ALTER TYPE "AllStarAuditAction" ADD VALUE IF NOT EXISTS 'FINAL_ROSTER_BULK_FINALIZE';

DROP INDEX IF EXISTS "AllStarInvite_ballotCycleId_invitedEmail_idx";
DROP INDEX IF EXISTS "AllStarInvite_organizationId_ageGroup_idx";
DROP INDEX IF EXISTS "AllStarVoteDraft_organizationId_ageGroup_idx";
DROP INDEX IF EXISTS "AllStarVoteSubmission_organizationId_ageGroup_submittedAt_idx";
DROP INDEX IF EXISTS "VolunteerRoleAssignment_teamId_idx";

ALTER TABLE "MerchProduct" ALTER COLUMN "updatedAt" DROP DEFAULT;

UPDATE "OrgAlert" SET "venues" = '[]'::jsonb WHERE "venues" IS NULL;
ALTER TABLE "OrgAlert" ALTER COLUMN "venues" SET NOT NULL;

-- Postgres folded these index names at 63 bytes. Prisma expects a different
-- 63-byte truncation. Rename only when the replay name exists and the schema
-- name does not. If both exist, drop the replay name.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'AllStarBallotCycle_organizationId_seasonYear_allStarAgeGroupId_'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'AllStarBallotCycle_organizationId_seasonYear_allStarAgeGrou_idx'
  ) THEN
    ALTER INDEX "AllStarBallotCycle_organizationId_seasonYear_allStarAgeGroupId_" RENAME TO "AllStarBallotCycle_organizationId_seasonYear_allStarAgeGrou_idx";
  ELSIF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'AllStarBallotCycle_organizationId_seasonYear_allStarAgeGroupId_'
  ) AND EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'AllStarBallotCycle_organizationId_seasonYear_allStarAgeGrou_idx'
  ) THEN
    DROP INDEX "AllStarBallotCycle_organizationId_seasonYear_allStarAgeGroupId_";
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'AllStarVoteSubmission_organizationId_ageGroup_phase_submittedAt'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'AllStarVoteSubmission_organizationId_ageGroup_phase_submitt_idx'
  ) THEN
    ALTER INDEX "AllStarVoteSubmission_organizationId_ageGroup_phase_submittedAt" RENAME TO "AllStarVoteSubmission_organizationId_ageGroup_phase_submitt_idx";
  ELSIF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'AllStarVoteSubmission_organizationId_ageGroup_phase_submittedAt'
  ) AND EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'AllStarVoteSubmission_organizationId_ageGroup_phase_submitt_idx'
  ) THEN
    DROP INDEX "AllStarVoteSubmission_organizationId_ageGroup_phase_submittedAt";
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'CoachingInterestSubmission_organizationId_interestedDivision_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'CoachingInterestSubmission_organizationId_interestedDivisio_idx'
  ) THEN
    ALTER INDEX "CoachingInterestSubmission_organizationId_interestedDivision_id" RENAME TO "CoachingInterestSubmission_organizationId_interestedDivisio_idx";
  ELSIF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'CoachingInterestSubmission_organizationId_interestedDivision_id'
  ) AND EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'CoachingInterestSubmission_organizationId_interestedDivisio_idx'
  ) THEN
    DROP INDEX "CoachingInterestSubmission_organizationId_interestedDivision_id";
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'CommunicationAudienceRule_ruleType_organizationId_coachingInter'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'CommunicationAudienceRule_ruleType_organizationId_coachingI_idx'
  ) THEN
    ALTER INDEX "CommunicationAudienceRule_ruleType_organizationId_coachingInter" RENAME TO "CommunicationAudienceRule_ruleType_organizationId_coachingI_idx";
  ELSIF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'CommunicationAudienceRule_ruleType_organizationId_coachingInter'
  ) AND EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'CommunicationAudienceRule_ruleType_organizationId_coachingI_idx'
  ) THEN
    DROP INDEX "CommunicationAudienceRule_ruleType_organizationId_coachingInter";
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'GameChangerScoreboardConnection_org_season_source_idx'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'GameChangerScoreboardConnection_organizationId_seasonYear_s_idx'
  ) THEN
    ALTER INDEX "GameChangerScoreboardConnection_org_season_source_idx" RENAME TO "GameChangerScoreboardConnection_organizationId_seasonYear_s_idx";
  ELSIF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'GameChangerScoreboardConnection_org_season_source_idx'
  ) AND EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'GameChangerScoreboardConnection_organizationId_seasonYear_s_idx'
  ) THEN
    DROP INDEX "GameChangerScoreboardConnection_org_season_source_idx";
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'GameChangerScoreboardConnection_org_season_source_key'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'GameChangerScoreboardConnection_organizationId_seasonYear_s_key'
  ) THEN
    ALTER INDEX "GameChangerScoreboardConnection_org_season_source_key" RENAME TO "GameChangerScoreboardConnection_organizationId_seasonYear_s_key";
  ELSIF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'GameChangerScoreboardConnection_org_season_source_key'
  ) AND EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'GameChangerScoreboardConnection_organizationId_seasonYear_s_key'
  ) THEN
    DROP INDEX "GameChangerScoreboardConnection_org_season_source_key";
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'GameChangerScoreboardConnection_source_key_idx'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'GameChangerScoreboardConnection_sourceType_sourceKey_idx'
  ) THEN
    ALTER INDEX "GameChangerScoreboardConnection_source_key_idx" RENAME TO "GameChangerScoreboardConnection_sourceType_sourceKey_idx";
  ELSIF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'GameChangerScoreboardConnection_source_key_idx'
  ) AND EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'GameChangerScoreboardConnection_sourceType_sourceKey_idx'
  ) THEN
    DROP INDEX "GameChangerScoreboardConnection_source_key_idx";
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'RegisteredUserDuplicateCandidate_newerUserId_candidateUserId_ke'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'RegisteredUserDuplicateCandidate_newerUserId_candidateUserI_key'
  ) THEN
    ALTER INDEX "RegisteredUserDuplicateCandidate_newerUserId_candidateUserId_ke" RENAME TO "RegisteredUserDuplicateCandidate_newerUserId_candidateUserI_key";
  ELSIF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'RegisteredUserDuplicateCandidate_newerUserId_candidateUserId_ke'
  ) AND EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'RegisteredUserDuplicateCandidate_newerUserId_candidateUserI_key'
  ) THEN
    DROP INDEX "RegisteredUserDuplicateCandidate_newerUserId_candidateUserId_ke";
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'SponsorPlacement_organizationId_showInFooterScroller_sortOrder_'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'SponsorPlacement_organizationId_showInFooterScroller_sortOr_idx'
  ) THEN
    ALTER INDEX "SponsorPlacement_organizationId_showInFooterScroller_sortOrder_" RENAME TO "SponsorPlacement_organizationId_showInFooterScroller_sortOr_idx";
  ELSIF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'SponsorPlacement_organizationId_showInFooterScroller_sortOrder_'
  ) AND EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'SponsorPlacement_organizationId_showInFooterScroller_sortOr_idx'
  ) THEN
    DROP INDEX "SponsorPlacement_organizationId_showInFooterScroller_sortOrder_";
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'SportsConnectImportRun_organizationId_seasonYear_driveFileId_re'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'SportsConnectImportRun_organizationId_seasonYear_driveFileI_key'
  ) THEN
    ALTER INDEX "SportsConnectImportRun_organizationId_seasonYear_driveFileId_re" RENAME TO "SportsConnectImportRun_organizationId_seasonYear_driveFileI_key";
  ELSIF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'SportsConnectImportRun_organizationId_seasonYear_driveFileId_re'
  ) AND EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'SportsConnectImportRun_organizationId_seasonYear_driveFileI_key'
  ) THEN
    DROP INDEX "SportsConnectImportRun_organizationId_seasonYear_driveFileId_re";
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'SportsConnectMappingPreset_organizationId_seasonYear_name_repor'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'SportsConnectMappingPreset_organizationId_seasonYear_name_r_key'
  ) THEN
    ALTER INDEX "SportsConnectMappingPreset_organizationId_seasonYear_name_repor" RENAME TO "SportsConnectMappingPreset_organizationId_seasonYear_name_r_key";
  ELSIF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'SportsConnectMappingPreset_organizationId_seasonYear_name_repor'
  ) AND EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'SportsConnectMappingPreset_organizationId_seasonYear_name_r_key'
  ) THEN
    DROP INDEX "SportsConnectMappingPreset_organizationId_seasonYear_name_repor";
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'VolunteerRequirementStatus_volunteerProfileId_requirementKey_ke'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'VolunteerRequirementStatus_volunteerProfileId_requirementKe_key'
  ) THEN
    ALTER INDEX "VolunteerRequirementStatus_volunteerProfileId_requirementKey_ke" RENAME TO "VolunteerRequirementStatus_volunteerProfileId_requirementKe_key";
  ELSIF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'VolunteerRequirementStatus_volunteerProfileId_requirementKey_ke'
  ) AND EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'VolunteerRequirementStatus_volunteerProfileId_requirementKe_key'
  ) THEN
    DROP INDEX "VolunteerRequirementStatus_volunteerProfileId_requirementKey_ke";
  END IF;
END $$;
