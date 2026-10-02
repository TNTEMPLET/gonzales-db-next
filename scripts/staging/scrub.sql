-- Staging PII scrub. Idempotent. One transaction, then row counts.
--
-- Column list generated from prisma/schema.prisma (44 email/phone String columns):
--   AdminUser.email                         kept (admin login)
--   TournamentIncomeTransaction.payerEmail
--   TournamentRosterSubmission.submitterEmail, submitterPhone
--   RegisteredUser.email, contactPhone      Trent / master-admin emails kept
--   CoachingInterestSubmission.email, cellPhone
--   AdminAuditLog.actorEmail, targetEmail
--   CommunicationCampaign.fromEmail
--   CommunicationRecipientSnapshot.email, phone
--   CommunicationDelivery.toEmail, toPhone
--   EmailSuppression.email                  rewritten (kept login emails stay)
--   SmsConsent.phone                        table cleared
--   CoachImportBatch.createdByEmail
--   TeamListImportBatch.createdByEmail
--   AllStarHeadCoachAssignment.coachEmail
--   AllStarInvite.invitedEmail
--   AllStarAuditLog.actorEmail
--   TeamPlayer.contactPhone, guardianEmail, guardianPhone
--   Sponsor.contactEmail, contactPhone
--   TournamentMonitorSubscription.email, phone
--   CapOrderRecord.payerEmail
--   ShirtOrderRecord.payerEmail
--   MerchOrderDraft.contactEmail, createdByEmail
--   Enrollment.guardianEmail, guardianPhone, contactPhone
--   TripParticipant.inviteEmailTo
--   TripResponse.submitterEmail, submitterPhone
--   SurveyResponse.respondentEmail, contactPhone
--   CoachPlayerProtection.guardianEmail
--   DraftPlayerPool.guardianEmail, guardianPhone
--
-- Emails become staging+<md5(id)>@example.invalid. Phones become +15550000000.
-- NULL stays NULL. Run with: psql "$STAGING" -v ON_ERROR_STOP=1 -f scripts/staging/scrub.sql

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE staging_kept_login_emails (
  email text PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO staging_kept_login_emails (email)
VALUES ('trent@apbaseball.com');

INSERT INTO staging_kept_login_emails (email)
SELECT lower(email)
FROM "AdminUser"
WHERE "isMaster" = true
ON CONFLICT DO NOTHING;

-- Sessions cannot be reused after the copy. SmsConsent stores real phone numbers.
DELETE FROM "AdminSession";
DELETE FROM "CoachSession";
DELETE FROM "SmsConsent";

-- Keep Trent's RegisteredUser (and any other master-admin email) so login still works.
-- Clear googleSub on everyone else so Google OAuth cannot reattach a scrubbed person.
UPDATE "RegisteredUser"
SET
  "googleSub" = CASE
    WHEN lower(email) IN (SELECT email FROM staging_kept_login_emails) THEN "googleSub"
    ELSE NULL
  END,
  email = CASE
    WHEN lower(email) IN (SELECT email FROM staging_kept_login_emails) THEN email
    ELSE 'staging+' || md5(id) || '@example.invalid'
  END,
  "contactPhone" = CASE
    WHEN "contactPhone" IS NULL THEN NULL
    WHEN lower(email) IN (SELECT email FROM staging_kept_login_emails) THEN "contactPhone"
    ELSE '+15550000000'
  END;

UPDATE "TournamentIncomeTransaction"
SET "payerEmail" = CASE
  WHEN "payerEmail" IS NULL THEN NULL
  ELSE 'staging+' || md5(id) || '@example.invalid'
END;

UPDATE "TournamentRosterSubmission"
SET
  "submitterEmail" = CASE
    WHEN "submitterEmail" IS NULL THEN NULL
    ELSE 'staging+' || md5(id) || '@example.invalid'
  END,
  "submitterPhone" = CASE
    WHEN "submitterPhone" IS NULL THEN NULL
    ELSE '+15550000000'
  END;

UPDATE "CoachingInterestSubmission"
SET
  email = 'staging+' || md5(id) || '@example.invalid',
  "cellPhone" = '+15550000000';

UPDATE "AdminAuditLog"
SET
  "actorEmail" = 'staging+' || md5(id) || '@example.invalid',
  "targetEmail" = 'staging+' || md5(id) || '@example.invalid';

UPDATE "CommunicationCampaign"
SET "fromEmail" = CASE
  WHEN "fromEmail" IS NULL THEN NULL
  ELSE 'staging+' || md5(id) || '@example.invalid'
END;

UPDATE "CommunicationRecipientSnapshot"
SET
  email = CASE
    WHEN email IS NULL THEN NULL
    ELSE 'staging+' || md5(id) || '@example.invalid'
  END,
  phone = CASE
    WHEN phone IS NULL THEN NULL
    ELSE '+15550000000'
  END;

UPDATE "CommunicationDelivery"
SET
  "toEmail" = CASE
    WHEN "toEmail" IS NULL THEN NULL
    ELSE 'staging+' || md5(id) || '@example.invalid'
  END,
  "toPhone" = CASE
    WHEN "toPhone" IS NULL THEN NULL
    ELSE '+15550000000'
  END;

UPDATE "EmailSuppression"
SET email = 'staging+' || md5(id) || '@example.invalid'
WHERE lower(email) NOT IN (SELECT email FROM staging_kept_login_emails);

UPDATE "CoachImportBatch"
SET "createdByEmail" = CASE
  WHEN "createdByEmail" IS NULL THEN NULL
  ELSE 'staging+' || md5(id) || '@example.invalid'
END;

UPDATE "TeamListImportBatch"
SET "createdByEmail" = CASE
  WHEN "createdByEmail" IS NULL THEN NULL
  ELSE 'staging+' || md5(id) || '@example.invalid'
END;

UPDATE "AllStarHeadCoachAssignment"
SET "coachEmail" = CASE
  WHEN "coachEmail" IS NULL THEN NULL
  ELSE 'staging+' || md5(id) || '@example.invalid'
END;

UPDATE "AllStarInvite"
SET "invitedEmail" = 'staging+' || md5(id) || '@example.invalid';

UPDATE "AllStarAuditLog"
SET "actorEmail" = 'staging+' || md5(id) || '@example.invalid';

UPDATE "TeamPlayer"
SET
  "contactPhone" = CASE
    WHEN "contactPhone" IS NULL THEN NULL
    ELSE '+15550000000'
  END,
  "guardianEmail" = CASE
    WHEN "guardianEmail" IS NULL THEN NULL
    ELSE 'staging+' || md5(id) || '@example.invalid'
  END,
  "guardianPhone" = CASE
    WHEN "guardianPhone" IS NULL THEN NULL
    ELSE '+15550000000'
  END;

UPDATE "Sponsor"
SET
  "contactEmail" = CASE
    WHEN "contactEmail" IS NULL THEN NULL
    ELSE 'staging+' || md5(id) || '@example.invalid'
  END,
  "contactPhone" = CASE
    WHEN "contactPhone" IS NULL THEN NULL
    ELSE '+15550000000'
  END;

UPDATE "TournamentMonitorSubscription"
SET
  email = CASE
    WHEN email IS NULL THEN NULL
    ELSE 'staging+' || md5(id) || '@example.invalid'
  END,
  phone = CASE
    WHEN phone IS NULL THEN NULL
    ELSE '+15550000000'
  END;

UPDATE "CapOrderRecord"
SET "payerEmail" = CASE
  WHEN "payerEmail" IS NULL THEN NULL
  ELSE 'staging+' || md5(id) || '@example.invalid'
END;

UPDATE "ShirtOrderRecord"
SET "payerEmail" = CASE
  WHEN "payerEmail" IS NULL THEN NULL
  ELSE 'staging+' || md5(id) || '@example.invalid'
END;

UPDATE "MerchOrderDraft"
SET
  "contactEmail" = CASE
    WHEN "contactEmail" IS NULL THEN NULL
    ELSE 'staging+' || md5(id) || '@example.invalid'
  END,
  "createdByEmail" = CASE
    WHEN "createdByEmail" IS NULL THEN NULL
    ELSE 'staging+' || md5(id) || '@example.invalid'
  END;

UPDATE "Enrollment"
SET
  "guardianEmail" = CASE
    WHEN "guardianEmail" IS NULL THEN NULL
    ELSE 'staging+' || md5(id) || '@example.invalid'
  END,
  "guardianPhone" = CASE
    WHEN "guardianPhone" IS NULL THEN NULL
    ELSE '+15550000000'
  END,
  "contactPhone" = CASE
    WHEN "contactPhone" IS NULL THEN NULL
    ELSE '+15550000000'
  END;

-- rawRow is the unmapped SportsConnect export and repeats guardian emails/phones.
UPDATE "Enrollment"
SET "rawRow" = regexp_replace(
      regexp_replace(
        "rawRow"::text,
        '[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}',
        'staging+redacted@example.invalid',
        'gi'
      ),
      '(\+1[\s.\-]?)?\(?[0-9]{3}\)?[\s.\-][0-9]{3}[\s.\-][0-9]{4}|\+[0-9]{11,15}',
      '+15550000000',
      'g'
    )::jsonb
WHERE "rawRow" IS NOT NULL;

-- explicitContacts is a JSON array of { email, name, ... }.
UPDATE "CommunicationAudienceRule"
SET "explicitContacts" = regexp_replace(
      regexp_replace(
        "explicitContacts"::text,
        '[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}',
        'staging+redacted@example.invalid',
        'gi'
      ),
      '(\+1[\s.\-]?)?\(?[0-9]{3}\)?[\s.\-][0-9]{3}[\s.\-][0-9]{4}|\+[0-9]{11,15}',
      '+15550000000',
      'g'
    )::jsonb
WHERE "explicitContacts" IS NOT NULL;

UPDATE "TripParticipant"
SET "inviteEmailTo" = CASE
  WHEN "inviteEmailTo" IS NULL THEN NULL
  ELSE 'staging+' || md5(id) || '@example.invalid'
END;

UPDATE "TripResponse"
SET
  "submitterEmail" = CASE
    WHEN "submitterEmail" IS NULL THEN NULL
    ELSE 'staging+' || md5(id) || '@example.invalid'
  END,
  "submitterPhone" = CASE
    WHEN "submitterPhone" IS NULL THEN NULL
    ELSE '+15550000000'
  END;

UPDATE "SurveyResponse"
SET
  "respondentEmail" = CASE
    WHEN "respondentEmail" IS NULL THEN NULL
    ELSE 'staging+' || md5(id) || '@example.invalid'
  END,
  "contactPhone" = CASE
    WHEN "contactPhone" IS NULL THEN NULL
    ELSE '+15550000000'
  END;

UPDATE "CoachPlayerProtection"
SET "guardianEmail" = CASE
  WHEN "guardianEmail" IS NULL THEN NULL
  ELSE 'staging+' || md5(id) || '@example.invalid'
END;

UPDATE "DraftPlayerPool"
SET
  "guardianEmail" = CASE
    WHEN "guardianEmail" IS NULL THEN NULL
    ELSE 'staging+' || md5(id) || '@example.invalid'
  END,
  "guardianPhone" = CASE
    WHEN "guardianPhone" IS NULL THEN NULL
    ELSE '+15550000000'
  END;

-- ---------------------------------------------------------------------------
-- TEST FAMILIES
-- Point 2–3 known families' guardian emails at one allowlisted inbox so
-- those families can still receive staging mail. The address is a placeholder.
-- Uncomment both statements and replace ALLOWLISTED_INBOX_PLACEHOLDER@example.com
-- plus the ids. Leave this block commented to keep every guardian on
-- @example.invalid.
-- ---------------------------------------------------------------------------
-- UPDATE "TeamPlayer"
-- SET "guardianEmail" = 'ALLOWLISTED_INBOX_PLACEHOLDER@example.com'
-- WHERE id IN (
--   'REPLACE_WITH_TEAM_PLAYER_ID_1',
--   'REPLACE_WITH_TEAM_PLAYER_ID_2',
--   'REPLACE_WITH_TEAM_PLAYER_ID_3'
-- );
--
-- UPDATE "Enrollment"
-- SET "guardianEmail" = 'ALLOWLISTED_INBOX_PLACEHOLDER@example.com'
-- WHERE id IN (
--   'REPLACE_WITH_ENROLLMENT_ID_1',
--   'REPLACE_WITH_ENROLLMENT_ID_2',
--   'REPLACE_WITH_ENROLLMENT_ID_3'
-- );

COMMIT;

-- Row counts only. Do not add email or phone columns to this query.
SELECT 'AdminSession' AS table_name, count(*) AS row_count FROM "AdminSession"
UNION ALL SELECT 'CoachSession', count(*) FROM "CoachSession"
UNION ALL SELECT 'SmsConsent', count(*) FROM "SmsConsent"
UNION ALL SELECT 'AdminUser', count(*) FROM "AdminUser"
UNION ALL SELECT 'RegisteredUser', count(*) FROM "RegisteredUser"
UNION ALL SELECT 'EmailSuppression', count(*) FROM "EmailSuppression"
UNION ALL SELECT 'TeamPlayer', count(*) FROM "TeamPlayer"
UNION ALL SELECT 'Enrollment', count(*) FROM "Enrollment"
UNION ALL SELECT 'CoachingInterestSubmission', count(*) FROM "CoachingInterestSubmission"
UNION ALL SELECT 'TournamentMonitorSubscription', count(*) FROM "TournamentMonitorSubscription"
UNION ALL SELECT 'CommunicationRecipientSnapshot', count(*) FROM "CommunicationRecipientSnapshot"
UNION ALL SELECT 'CommunicationDelivery', count(*) FROM "CommunicationDelivery"
UNION ALL SELECT 'DraftPlayerPool', count(*) FROM "DraftPlayerPool"
UNION ALL SELECT 'SurveyResponse', count(*) FROM "SurveyResponse"
UNION ALL SELECT 'TripResponse', count(*) FROM "TripResponse"
ORDER BY 1;
