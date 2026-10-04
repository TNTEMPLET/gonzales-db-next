-- Staging PII scrub. Idempotent. One transaction, then row counts.
--
-- Column list generated from prisma/schema.prisma (44 email/phone String columns):
--   AdminUser.email                         kept (admin login)
--   TournamentIncomeTransaction.payerEmail
--   TournamentRosterSubmission.submitterEmail, submitterPhone
--   RegisteredUser.email, contactPhone      @apbaseball.com admins / master admins kept
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
-- NULL stays NULL.
--
-- Also scrubbed, idempotently, and with the same stand-in for the same source
-- string in every table:
--   person names (players, guardians, coaches, users, contacts, payers,
--   monitor subscribers, scoreboard checkout names)
--   the same stand-in inside audit summaries, PayPal notes, and checkout notes
--   birthDate day-of-month (year and month stay; every date in a month maps
--   to one day so a second run does not move it again)
--   streetAddress (and unit, city, state, postal code)
--   medical / health free text, including Enrollment.rawRow, survey answers,
--   and trip answers
--   names and street addresses inside Enrollment.rawRow and import undo JSON
--   plaintext invite tokens (AllStarInvite, AllStarBallotCycle, TripParticipant)
--   passwordHash and googleSub
-- @apbaseball.com AdminUser rows (and master admins) keep email, name, and
-- passwordHash so those logins still work. googleSub is cleared for everyone;
-- the next Google sign-in looks the admin up by email and stores the new sub.
-- Other AdminUser emails stay so an existing admin can still be found; their
-- password hash is cleared.
-- Run with: psql "$STAGING" -v ON_ERROR_STOP=1 -f scripts/staging/scrub.sql

\set ON_ERROR_STOP on

BEGIN;

-- Helper calls are schema-qualified (pg_temp.staging_*) so a function lookup
-- cannot miss and abort the scrub, which would leave production rows in place.
-- search_path still includes pg_temp for any unqualified helper reference.
SET LOCAL search_path TO pg_temp, public;

-- First action: abort with no changes unless this database is marked staging.
-- The marker is created by hand on staging only and must never exist on
-- production. pg_restore --clean can drop it; the refresh workflow puts it
-- back before this script runs.
--
--   CREATE TABLE public._environment (
--     value text PRIMARY KEY CHECK (value = 'staging')
--   );
--   INSERT INTO public._environment (value) VALUES ('staging');
DO $$
DECLARE
  n int;
  marker text;
BEGIN
  IF to_regclass('public._environment') IS NULL THEN
    RAISE EXCEPTION 'refusing to scrub: public._environment marker is missing';
  END IF;
  SELECT count(*) INTO n FROM public._environment;
  IF n <> 1 THEN
    RAISE EXCEPTION 'refusing to scrub: public._environment must contain exactly one row';
  END IF;
  SELECT value INTO marker FROM public._environment;
  IF marker IS DISTINCT FROM 'staging' THEN
    RAISE EXCEPTION 'refusing to scrub: public._environment value is not staging';
  END IF;
END
$$;

CREATE TEMP TABLE staging_kept_login_emails (
  email text PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO staging_kept_login_emails (email)
VALUES ('trent@apbaseball.com');

INSERT INTO staging_kept_login_emails (email)
SELECT lower(email)
FROM "AdminUser"
WHERE "isMaster" = true
   OR lower(email) ~ '@apbaseball\.com$'
ON CONFLICT DO NOTHING;

-- Session-local helpers. Dropped when the psql session ends. Same source
-- string always maps to the same stand-in, and running the script twice
-- does not change a value that was already scrubbed.
CREATE OR REPLACE FUNCTION pg_temp.staging_alias_name(n text) RETURNS text
LANGUAGE plpgsql AS $fn$
DECLARE
  trimmed text;
  norm text;
BEGIN
  IF n IS NULL THEN
    RETURN NULL;
  END IF;
  trimmed := btrim(n);
  IF trimmed = '' THEN
    RETURN n;
  END IF;
  IF trimmed ~ '^s[0-9a-f]{32}( s[0-9a-f]{32})*$' THEN
    RETURN trimmed;
  END IF;
  norm := lower(trimmed);
  norm := regexp_replace(norm, '[^a-z0-9]+', ' ', 'g');
  norm := btrim(regexp_replace(norm, '[[:space:]]+', ' ', 'g'));
  IF norm = '' THEN
    norm := lower(trimmed);
  END IF;
  RETURN 's' || md5(norm);
END;
$fn$;

CREATE OR REPLACE FUNCTION pg_temp.staging_scrub_street(a text) RETURNS text
LANGUAGE sql AS $fn$
  SELECT CASE
    WHEN a IS NULL THEN NULL
    WHEN btrim(a) = '' THEN a
    WHEN btrim(a) = '100 Staging Street' THEN a
    ELSE '100 Staging Street'
  END
$fn$;

-- Day-of-month only. Year, month, and time-of-day stay. The new day depends
-- on year+month, not on the current day, so a second run is a no-op.
CREATE OR REPLACE FUNCTION pg_temp.staging_shift_birthdate(d timestamp) RETURNS timestamp
LANGUAGE plpgsql AS $fn$
DECLARE
  month_start timestamp;
  dim int;
  shifted int;
  hash_bits bigint;
BEGIN
  IF d IS NULL THEN
    RETURN NULL;
  END IF;
  month_start := date_trunc('month', d);
  dim := extract(day FROM (month_start + interval '1 month' - interval '1 day'))::int;
  -- md5 hex, not a bit-string cast: ('x' || hex)::bit(32) is invalid in Postgres.
  hash_bits := (
    get_byte(decode(substr(md5(to_char(month_start, 'YYYY-MM')), 1, 8), 'hex'), 0)::bigint * 16777216
    + get_byte(decode(substr(md5(to_char(month_start, 'YYYY-MM')), 1, 8), 'hex'), 1)::bigint * 65536
    + get_byte(decode(substr(md5(to_char(month_start, 'YYYY-MM')), 1, 8), 'hex'), 2)::bigint * 256
    + get_byte(decode(substr(md5(to_char(month_start, 'YYYY-MM')), 1, 8), 'hex'), 3)::bigint
  );
  shifted := (1 + (hash_bits % dim))::int;
  RETURN month_start
    + make_interval(days => shifted - 1)
    + (d - date_trunc('day', d));
END;
$fn$;

CREATE OR REPLACE FUNCTION pg_temp.staging_shift_birthdate_text(raw text) RETURNS text
LANGUAGE plpgsql AS $fn$
DECLARE
  t text;
  ts timestamp;
  y int;
  m int;
  day int;
BEGIN
  IF raw IS NULL THEN
    RETURN NULL;
  END IF;
  t := btrim(raw);
  IF t = '' OR t = 'redacted' THEN
    RETURN raw;
  END IF;
  BEGIN
    IF t ~ '^\d{4}-\d{2}-\d{2}' THEN
      ts := substring(t FROM 1 FOR 10)::timestamp;
      RETURN to_char(pg_temp.staging_shift_birthdate(ts), 'YYYY-MM-DD');
    END IF;
    IF t ~ '^\d{1,2}/\d{1,2}/\d{4}' THEN
      m := split_part(t, '/', 1)::int;
      day := split_part(t, '/', 2)::int;
      y := split_part(split_part(t, '/', 3), ' ', 1)::int;
      ts := make_timestamp(y, m, day, 0, 0, 0);
      RETURN to_char(pg_temp.staging_shift_birthdate(ts), 'YYYY-MM-DD');
    END IF;
  EXCEPTION WHEN others THEN
    RETURN 'redacted';
  END;
  RETURN 'redacted';
END;
$fn$;

-- orderNo::normalizedName, or normalizedName::YYYY-MM-DD / nodob.
CREATE OR REPLACE FUNCTION pg_temp.staging_scrub_row_key(k text) RETURNS text
LANGUAGE plpgsql AS $fn$
DECLARE
  leftp text;
  rightp text;
  shifted text;
BEGIN
  IF k IS NULL OR btrim(k) = '' THEN
    RETURN k;
  END IF;
  IF position('::' IN k) = 0 THEN
    RETURN pg_temp.staging_alias_name(k);
  END IF;
  leftp := split_part(k, '::', 1);
  rightp := split_part(k, '::', 2);
  IF rightp = 'nodob' OR rightp ~ '^\d{4}-\d{2}-\d{2}' THEN
    IF rightp = 'nodob' THEN
      shifted := 'nodob';
    ELSE
      shifted := pg_temp.staging_shift_birthdate_text(rightp);
    END IF;
    RETURN pg_temp.staging_alias_name(leftp) || '::' || shifted;
  END IF;
  RETURN leftp || '::' || pg_temp.staging_alias_name(rightp);
END;
$fn$;

CREATE OR REPLACE FUNCTION pg_temp.staging_json_key_kind(k text) RETURNS text
LANGUAGE plpgsql AS $fn$
DECLARE
  lk text;
BEGIN
  lk := lower(btrim(k));
  IF lk ~ 'e-?mail' THEN
    RETURN 'email';
  END IF;
  IF lk ~ '(phone|telephone|cellphone)' OR lk IN ('cell phone', 'mobile') THEN
    RETURN 'phone';
  END IF;
  IF lk IN (
    'team name', 'teamname', 'division name', 'divisionname', 'program name', 'programname',
    'item name', 'itemname', 'business name', 'businessname', 'product name', 'productname',
    'file name', 'filename', 'originalfilename', 'park name', 'short name', 'shortname',
    'age group', 'agegroup'
  ) THEN
    RETURN 'keep';
  END IF;
  -- The SportsConnect follow-up ("please explain / describe the condition")
  -- has no medical/allergy word of its own, but it is the free-text detail.
  IF lk ~ '^health_'
     OR lk ~ '(medical|allerg|medication|\yhealth\y|describe the condition|physical condition|tetanus|immuni[sz]|vaccin|shot date|condition|physician|insur|\ydoctor\y)' THEN
    RETURN 'medical';
  END IF;
  IF lk ~ 'birth[ _]?date' OR lk ~ 'date[ _]?of[ _]?birth'
     OR lk IN ('dob', 'date of birth', 'birthdate', 'birth_date', 'date_of_birth') THEN
    RETURN 'birth';
  END IF;
  IF lk IN ('sportsconnectrowkey') THEN
    RETURN 'rowkey';
  END IF;
  IF lk IN ('enrollmentkeys') THEN
    RETURN 'rowkeys';
  END IF;
  IF lk IN ('unit', 'addressunit', 'address unit', 'address line 2', 'addressline2')
     OR lk ~ 'address unit' THEN
    RETURN 'unit';
  END IF;
  IF lk ~ 'street'
     OR lk ~ '(^|[^a-z])address$'
     OR lk IN (
       'streetaddress', 'address', 'address line 1', 'addressline1', 'address line1',
       'home address', 'mailing address', 'player address'
     ) THEN
    RETURN 'street';
  END IF;
  -- The rest of a home address. "capacity" must not match, so city/state
  -- require a whole word, not a suffix like "city" inside another word.
  IF lk IN ('city', 'town') OR lk ~ ' city$' THEN
    RETURN 'city';
  END IF;
  IF lk IN ('state') OR lk ~ ' state$' THEN
    RETURN 'state';
  END IF;
  IF lk IN ('zip', 'zipcode', 'postal', 'postalcode')
     OR lk ~ 'zip code$'
     OR lk ~ 'postal code$' THEN
    RETURN 'postal';
  END IF;
  -- SportsConnect sometimes stores the full name under a bare "Player" header.
  IF lk IN ('player', 'participant', 'registrant') THEN
    RETURN 'name';
  END IF;
  -- Person-name keys, including "Parent Name", "Child Name", and trip keys
  -- such as first_name / guardian1_last_name. Team, division, program,
  -- business, product, file, and park names are already returned above.
  IF lk ~ 'name$'
     AND lk !~ '(team|division|program|business|product|file|park|item)' THEN
    RETURN 'name';
  END IF;
  RETURN 'text';
END;
$fn$;

-- One stand-in per kind so column updates and JSON values cannot drift.
CREATE OR REPLACE FUNCTION pg_temp.staging_scrub_scalar(kind text, raw text) RETURNS text
LANGUAGE plpgsql AS $fn$
BEGIN
  IF kind = 'name' THEN
    RETURN pg_temp.staging_alias_name(raw);
  ELSIF kind = 'street' THEN
    RETURN pg_temp.staging_scrub_street(raw);
  ELSIF kind = 'unit' THEN
    RETURN NULL;
  ELSIF kind = 'city' THEN
    IF raw IS NULL OR btrim(raw) = '' OR btrim(raw) = 'Staging' THEN
      RETURN raw;
    END IF;
    RETURN 'Staging';
  ELSIF kind = 'state' THEN
    IF raw IS NULL OR btrim(raw) = '' OR btrim(raw) = 'ST' THEN
      RETURN raw;
    END IF;
    RETURN 'ST';
  ELSIF kind = 'postal' THEN
    IF raw IS NULL OR btrim(raw) = '' OR btrim(raw) = '00000' THEN
      RETURN raw;
    END IF;
    RETURN '00000';
  ELSIF kind = 'medical' THEN
    IF raw IS NULL OR btrim(raw) = '' OR btrim(raw) = 'redacted' THEN
      RETURN raw;
    END IF;
    RETURN 'redacted';
  ELSIF kind = 'birth' THEN
    RETURN pg_temp.staging_shift_birthdate_text(raw);
  ELSIF kind = 'rowkey' THEN
    RETURN pg_temp.staging_scrub_row_key(raw);
  ELSIF kind = 'email' THEN
    IF raw IS NULL OR btrim(raw) = '' THEN
      RETURN raw;
    ELSIF lower(raw) ~ '@example\.invalid$'
       OR lower(raw) IN (SELECT email FROM staging_kept_login_emails) THEN
      RETURN raw;
    ELSE
      RETURN 'staging+' || substr(md5(lower(raw)), 1, 16) || '@example.invalid';
    END IF;
  ELSIF kind = 'phone' THEN
    IF raw IS NULL OR btrim(raw) = '' OR btrim(raw) = '+15550000000' THEN
      RETURN raw;
    END IF;
    RETURN '+15550000000';
  ELSE
    RETURN raw;
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION pg_temp.staging_scrub_json(j jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE
  result jsonb := '{}'::jsonb;
  k text;
  v jsonb;
  kind text;
  scrubbed text;
  arr jsonb;
  elem jsonb;
BEGIN
  IF j IS NULL THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(j) = 'array' THEN
    SELECT COALESCE(jsonb_agg(
      CASE
        WHEN jsonb_typeof(value) = 'string' THEN to_jsonb(pg_temp.staging_scrub_plaintext(value #>> '{}'))
        ELSE pg_temp.staging_scrub_json(value)
      END
      ORDER BY ord), '[]'::jsonb)
      INTO result
    FROM jsonb_array_elements(j) WITH ORDINALITY AS arr(value, ord);
    RETURN result;
  END IF;
  IF jsonb_typeof(j) <> 'object' THEN
    RETURN j;
  END IF;
  FOR k, v IN SELECT key, value FROM jsonb_each(j)
  LOOP
    kind := pg_temp.staging_json_key_kind(k);
    IF kind = 'medical' THEN
      result := result || jsonb_build_object(k, to_jsonb('redacted'::text));
    ELSIF kind = 'rowkeys' AND jsonb_typeof(v) = 'array' THEN
      arr := '[]'::jsonb;
      FOR elem IN SELECT value FROM jsonb_array_elements(v)
      LOOP
        IF jsonb_typeof(elem) = 'string' THEN
          arr := arr || jsonb_build_array(to_jsonb(pg_temp.staging_scrub_row_key(elem #>> '{}')));
        ELSE
          arr := arr || jsonb_build_array(pg_temp.staging_scrub_json(elem));
        END IF;
      END LOOP;
      result := result || jsonb_build_object(k, arr);
    ELSIF kind IN ('name', 'street', 'unit', 'city', 'state', 'postal', 'birth', 'rowkey', 'email', 'phone')
          AND jsonb_typeof(v) = 'array' THEN
      arr := '[]'::jsonb;
      FOR elem IN SELECT value FROM jsonb_array_elements(v)
      LOOP
        IF jsonb_typeof(elem) IN ('string', 'number') THEN
          arr := arr || jsonb_build_array(to_jsonb(pg_temp.staging_scrub_scalar(kind, elem #>> '{}')));
        ELSIF jsonb_typeof(elem) IN ('object', 'array') THEN
          arr := arr || jsonb_build_array(pg_temp.staging_scrub_json(elem));
        ELSE
          arr := arr || jsonb_build_array(elem);
        END IF;
      END LOOP;
      result := result || jsonb_build_object(k, arr);
    ELSIF jsonb_typeof(v) IN ('string', 'number') AND kind NOT IN ('keep', 'text') THEN
      result := result || jsonb_build_object(k, to_jsonb(pg_temp.staging_scrub_scalar(kind, v #>> '{}')));
    ELSIF jsonb_typeof(v) IN ('object', 'array') THEN
      result := result || jsonb_build_object(k, pg_temp.staging_scrub_json(v));
    ELSIF jsonb_typeof(v) = 'string' THEN
      scrubbed := v #>> '{}';
      scrubbed := regexp_replace(
        scrubbed,
        '[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}',
        'staging+redacted@example.invalid',
        'gi'
      );
      scrubbed := regexp_replace(
        scrubbed,
        '(\+1[\s.\-]?)?\(?[0-9]{3}\)?[\s.\-][0-9]{3}[\s.\-][0-9]{4}|\+[0-9]{11,15}',
        '+15550000000',
        'g'
      );
      result := result || jsonb_build_object(k, to_jsonb(scrubbed));
    ELSE
      result := result || jsonb_build_object(k, v);
    END IF;
  END LOOP;
  RETURN result;
END;
$fn$;

CREATE OR REPLACE FUNCTION pg_temp.staging_scrub_json_text(raw text) RETURNS text
LANGUAGE plpgsql AS $fn$
DECLARE
  scrubbed text;
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN raw;
  END IF;
  BEGIN
    RETURN pg_temp.staging_scrub_json(raw::jsonb)::text;
  EXCEPTION WHEN others THEN
    scrubbed := regexp_replace(
      raw,
      '[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}',
      'staging+redacted@example.invalid',
      'gi'
    );
    RETURN regexp_replace(
      scrubbed,
      '(\+1[\s.\-]?)?\(?[0-9]{3}\)?[\s.\-][0-9]{3}[\s.\-][0-9]{4}|\+[0-9]{11,15}',
      '+15550000000',
      'g'
    );
  END;
END;
$fn$;

CREATE OR REPLACE FUNCTION pg_temp.staging_scrub_plaintext(raw text) RETURNS text
LANGUAGE plpgsql AS $fn$
DECLARE
  scrubbed text;
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN raw;
  END IF;
  scrubbed := regexp_replace(
    raw,
    '[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}',
    'staging+redacted@example.invalid',
    'gi'
  );
  RETURN regexp_replace(
    scrubbed,
    '(\+1[\s.\-]?)?\(?[0-9]{3}\)?[\s.\-][0-9]{3}[\s.\-][0-9]{4}|\+[0-9]{11,15}',
    '+15550000000',
    'g'
  );
END;
$fn$;

-- Case-sensitive whole token. A short name must not eat a size code ("AL")
-- or the inside of a longer word. Values that are already stand-ins stay put.
CREATE OR REPLACE FUNCTION pg_temp.staging_replace_exact(haystack text, needle text) RETURNS text
LANGUAGE plpgsql AS $fn$
DECLARE
  trimmed text;
  escaped text;
BEGIN
  IF haystack IS NULL OR needle IS NULL THEN
    RETURN haystack;
  END IF;
  trimmed := btrim(needle);
  IF trimmed = '' OR trimmed ~ '^s[0-9a-f]{32}( s[0-9a-f]{32})*$' THEN
    RETURN haystack;
  END IF;
  escaped := regexp_replace(trimmed, '([^a-zA-Z0-9])', '\\\1', 'g');
  RETURN regexp_replace(haystack, '\m' || escaped || '\M', pg_temp.staging_alias_name(trimmed), 'gi');
END;
$fn$;

-- Built before any name column is rewritten. Longer strings are replaced
-- first so "John Smith" does not leave a leftover "John".
CREATE TEMP TABLE staging_name_map (
  raw_name text PRIMARY KEY,
  alias_name text NOT NULL
) ON COMMIT DROP;

INSERT INTO staging_name_map (raw_name, alias_name)
SELECT trimmed, pg_temp.staging_alias_name(trimmed)
FROM (
  SELECT DISTINCT btrim(val) AS trimmed
  FROM (
    SELECT unnest(ARRAY["firstName", "lastName", "name"]) AS val FROM "AdminUser"
    UNION ALL
    SELECT unnest(ARRAY["firstName", "lastName", "name"]) FROM "RegisteredUser"
    UNION ALL
    SELECT "payerName" FROM "TournamentIncomeTransaction"
    UNION ALL
    SELECT "submitterName" FROM "TournamentRosterSubmission"
    UNION ALL
    SELECT unnest(ARRAY["firstName", "lastName"]) FROM "TournamentRosterSubmissionPlayer"
    UNION ALL
    SELECT unnest(ARRAY["firstName", "lastName"]) FROM "CoachingInterestSubmission"
    UNION ALL
    SELECT "targetName" FROM "AdminAuditLog"
    UNION ALL
    SELECT "contactName" FROM "CommunicationRecipientSnapshot"
    UNION ALL
    SELECT "coachName" FROM "AllStarHeadCoachAssignment"
    UNION ALL
    SELECT "playerFullName" FROM "AllStarCandidate"
    UNION ALL
    SELECT unnest(ARRAY["playerFullName", "payerName"]) FROM "AllStarPayment"
    UNION ALL
    SELECT unnest(ARRAY["firstName", "lastName", "fullName", "guardianFirstName", "guardianLastName"]) FROM "TeamPlayer"
    UNION ALL
    SELECT "contactName" FROM "Sponsor"
    UNION ALL
    SELECT "name" FROM "TournamentMonitorSubscription"
    UNION ALL
    SELECT "payerName" FROM "CapOrderRecord"
    UNION ALL
    SELECT "payerName" FROM "ShirtOrderRecord"
    UNION ALL
    SELECT "playerName" FROM "MerchOrderDraft"
    UNION ALL
    SELECT unnest(ARRAY["firstName", "lastName", "fullName", "guardianFirstName", "guardianLastName"]) FROM "Enrollment"
    UNION ALL
    SELECT "playerFullName" FROM "TripParticipant"
    UNION ALL
    SELECT "submitterName" FROM "TripResponse"
    UNION ALL
    SELECT "contactName" FROM "SurveyResponse"
    UNION ALL
    SELECT "playerName" FROM "CoachPlayerProtection"
    UNION ALL
    SELECT unnest(ARRAY["firstName", "lastName", "fullName"]) FROM "DraftPlayerPool"
    UNION ALL
    SELECT "scoreboardCheckoutName" FROM "ScheduleDraftGame"
  ) collected
  WHERE val IS NOT NULL
) named
WHERE trimmed <> ''
  AND char_length(trimmed) >= 3
  AND trimmed !~ '^s[0-9a-f]{32}( s[0-9a-f]{32})*$'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION pg_temp.staging_scrub_known_names(raw text) RETURNS text
LANGUAGE plpgsql AS $fn$
DECLARE
  rec record;
  out text;
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN raw;
  END IF;
  out := raw;
  FOR rec IN
    SELECT raw_name
    FROM staging_name_map
    WHERE position(lower(raw_name) IN lower(out)) > 0
    ORDER BY char_length(raw_name) DESC, raw_name
  LOOP
    out := pg_temp.staging_replace_exact(out, rec.raw_name);
  END LOOP;
  RETURN pg_temp.staging_scrub_plaintext(out);
END;
$fn$;

-- Sessions cannot be reused after the copy. SmsConsent stores real phone numbers.
DELETE FROM "AdminSession";
DELETE FROM "CoachSession";
DELETE FROM "SmsConsent";

-- Kept logins stay usable (email, phone, name). Everyone loses the prod
-- Google id and password hash. Admin password hashes are handled on AdminUser.
UPDATE "RegisteredUser"
SET
  "googleSub" = NULL,
  "passwordHash" = NULL,
  email = CASE
    WHEN lower(email) IN (SELECT email FROM staging_kept_login_emails) THEN email
    ELSE 'staging+' || md5(id) || '@example.invalid'
  END,
  "contactPhone" = CASE
    WHEN "contactPhone" IS NULL THEN NULL
    WHEN lower(email) IN (SELECT email FROM staging_kept_login_emails) THEN "contactPhone"
    ELSE '+15550000000'
  END,
  "firstName" = CASE
    WHEN lower(email) IN (SELECT email FROM staging_kept_login_emails) THEN "firstName"
    ELSE pg_temp.staging_alias_name("firstName")
  END,
  "lastName" = CASE
    WHEN lower(email) IN (SELECT email FROM staging_kept_login_emails) THEN "lastName"
    ELSE pg_temp.staging_alias_name("lastName")
  END,
  "name" = CASE
    WHEN lower(email) IN (SELECT email FROM staging_kept_login_emails) THEN "name"
    ELSE pg_temp.staging_alias_name("name")
  END;

-- @apbaseball.com and master admins keep name + passwordHash. googleSub is
-- cleared; Google sign-in finds the row by email and writes a new sub.
UPDATE "AdminUser"
SET
  "googleSub" = NULL,
  "passwordHash" = CASE
    WHEN lower(email) IN (SELECT email FROM staging_kept_login_emails) THEN "passwordHash"
    ELSE NULL
  END,
  "firstName" = CASE
    WHEN lower(email) IN (SELECT email FROM staging_kept_login_emails) THEN "firstName"
    ELSE pg_temp.staging_alias_name("firstName")
  END,
  "lastName" = CASE
    WHEN lower(email) IN (SELECT email FROM staging_kept_login_emails) THEN "lastName"
    ELSE pg_temp.staging_alias_name("lastName")
  END,
  "name" = CASE
    WHEN lower(email) IN (SELECT email FROM staging_kept_login_emails) THEN "name"
    ELSE pg_temp.staging_alias_name("name")
  END;

UPDATE "TournamentIncomeTransaction"
SET
  "payerEmail" = CASE
    WHEN "payerEmail" IS NULL THEN NULL
    ELSE 'staging+' || md5(id) || '@example.invalid'
  END,
  "payerName" = pg_temp.staging_alias_name("payerName"),
  "paypalNote" = pg_temp.staging_scrub_known_names(pg_temp.staging_replace_exact("paypalNote", "payerName")),
  "paypalMemo" = pg_temp.staging_scrub_known_names(pg_temp.staging_replace_exact("paypalMemo", "payerName")),
  "adminNotes" = pg_temp.staging_scrub_known_names("adminNotes");

UPDATE "TournamentRosterSubmission"
SET
  "submitterEmail" = CASE
    WHEN "submitterEmail" IS NULL THEN NULL
    ELSE 'staging+' || md5(id) || '@example.invalid'
  END,
  "submitterPhone" = CASE
    WHEN "submitterPhone" IS NULL THEN NULL
    ELSE '+15550000000'
  END,
  "submitterName" = pg_temp.staging_alias_name("submitterName"),
  notes = pg_temp.staging_scrub_known_names(pg_temp.staging_replace_exact(notes, "submitterName")),
  -- Uploaded CSV repeats player names, phones, and emails that the player
  -- columns below do not cover.
  "rawCsv" = NULL;

UPDATE "TournamentRosterSubmissionPlayer"
SET
  "firstName" = pg_temp.staging_alias_name("firstName"),
  "lastName" = pg_temp.staging_alias_name("lastName");

UPDATE "CoachingInterestSubmission"
SET
  email = 'staging+' || md5(id) || '@example.invalid',
  "cellPhone" = '+15550000000',
  "firstName" = pg_temp.staging_alias_name("firstName"),
  "lastName" = pg_temp.staging_alias_name("lastName"),
  notes = pg_temp.staging_scrub_known_names(notes),
  "adminNotes" = pg_temp.staging_scrub_known_names("adminNotes");

UPDATE "AdminAuditLog"
SET
  "actorEmail" = 'staging+' || md5(id) || '@example.invalid',
  "targetEmail" = 'staging+' || md5(id) || '@example.invalid',
  "targetName" = CASE
    WHEN lower("targetEmail") IN (SELECT email FROM staging_kept_login_emails) THEN "targetName"
    ELSE pg_temp.staging_alias_name("targetName")
  END;

UPDATE "CommunicationCampaign"
SET
  "fromEmail" = CASE
    WHEN "fromEmail" IS NULL THEN NULL
    ELSE 'staging+' || md5(id) || '@example.invalid'
  END,
  title = pg_temp.staging_scrub_known_names(title),
  "messageSubject" = pg_temp.staging_scrub_known_names("messageSubject"),
  "messageBody" = pg_temp.staging_scrub_known_names("messageBody");

UPDATE "CommunicationRecipientSnapshot"
SET
  email = CASE
    WHEN email IS NULL THEN NULL
    ELSE 'staging+' || md5(id) || '@example.invalid'
  END,
  phone = CASE
    WHEN phone IS NULL THEN NULL
    ELSE '+15550000000'
  END,
  "contactName" = pg_temp.staging_alias_name("contactName");

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
SET
  "coachEmail" = CASE
    WHEN "coachEmail" IS NULL THEN NULL
    WHEN lower("coachEmail") IN (SELECT email FROM staging_kept_login_emails) THEN "coachEmail"
    ELSE 'staging+' || md5(id) || '@example.invalid'
  END,
  "coachName" = CASE
    WHEN lower("coachEmail") IN (SELECT email FROM staging_kept_login_emails) THEN "coachName"
    ELSE pg_temp.staging_alias_name("coachName")
  END;

-- Prod roster-link tokens are stored only as a hash. Replace the hash so a
-- copied production link cannot open staging.
UPDATE "TournamentRosterIntakeLink"
SET "tokenHash" = md5('scrubbed-roster-link:' || id);

UPDATE "AllStarInvite"
SET
  "invitedEmail" = CASE
    WHEN lower("invitedEmail") IN (SELECT email FROM staging_kept_login_emails) THEN "invitedEmail"
    ELSE 'staging+' || md5(id) || '@example.invalid'
  END,
  "inviteToken" = CASE
    WHEN "inviteToken" IS NULL THEN NULL
    ELSE 'st' || md5(id)
  END,
  "tokenHash" = CASE
    WHEN "tokenHash" IS NULL THEN NULL
    ELSE md5('scrubbed-invite:' || id)
  END;

UPDATE "AllStarBallotCycle"
SET
  "ballotLinkToken" = CASE
    WHEN "ballotLinkToken" IS NULL THEN NULL
    ELSE 'st' || md5(id)
  END,
  "ballotLinkTokenHash" = CASE
    WHEN "ballotLinkTokenHash" IS NULL THEN NULL
    ELSE md5('scrubbed-ballot:' || id)
  END;

UPDATE "AllStarCandidate"
SET "playerFullName" = pg_temp.staging_alias_name("playerFullName");

UPDATE "AllStarPayment"
SET
  "playerFullName" = pg_temp.staging_alias_name("playerFullName"),
  "payerName" = pg_temp.staging_alias_name("payerName"),
  "paypalNote" = pg_temp.staging_scrub_known_names(
    pg_temp.staging_replace_exact(pg_temp.staging_replace_exact("paypalNote", "playerFullName"), "payerName")
  ),
  notes = pg_temp.staging_scrub_known_names(
    pg_temp.staging_replace_exact(pg_temp.staging_replace_exact(notes, "playerFullName"), "payerName")
  );

UPDATE "AllStarAuditLog"
SET
  "actorEmail" = 'staging+' || md5(id) || '@example.invalid',
  summary = pg_temp.staging_scrub_known_names(summary),
  "beforeState" = CASE
    WHEN "beforeState" IS NULL THEN NULL
    ELSE pg_temp.staging_scrub_json("beforeState")
  END,
  "afterState" = CASE
    WHEN "afterState" IS NULL THEN NULL
    ELSE pg_temp.staging_scrub_json("afterState")
  END;

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
  END,
  "firstName" = pg_temp.staging_alias_name("firstName"),
  "lastName" = pg_temp.staging_alias_name("lastName"),
  "fullName" = pg_temp.staging_alias_name("fullName"),
  "guardianFirstName" = pg_temp.staging_alias_name("guardianFirstName"),
  "guardianLastName" = pg_temp.staging_alias_name("guardianLastName"),
  "birthDate" = pg_temp.staging_shift_birthdate("birthDate"),
  "streetAddress" = pg_temp.staging_scrub_street("streetAddress"),
  unit = NULL,
  city = CASE
    WHEN city IS NULL OR btrim(city) = '' THEN city
    ELSE 'Staging'
  END,
  state = CASE
    WHEN state IS NULL OR btrim(state) = '' THEN state
    ELSE 'ST'
  END,
  "postalCode" = CASE
    WHEN "postalCode" IS NULL OR btrim("postalCode") = '' THEN "postalCode"
    ELSE '00000'
  END,
  "medicalConditionsSummary" = NULL,
  "medicalConditionsDetails" = NULL,
  "medicalTreatmentAuthorized" = NULL;

UPDATE "Sponsor"
SET
  "contactEmail" = CASE
    WHEN "contactEmail" IS NULL THEN NULL
    ELSE 'staging+' || md5(id) || '@example.invalid'
  END,
  "contactPhone" = CASE
    WHEN "contactPhone" IS NULL THEN NULL
    ELSE '+15550000000'
  END,
  "contactName" = pg_temp.staging_alias_name("contactName"),
  notes = pg_temp.staging_scrub_known_names(notes);

UPDATE "TournamentMonitorSubscription"
SET
  email = CASE
    WHEN email IS NULL THEN NULL
    ELSE 'staging+' || md5(id) || '@example.invalid'
  END,
  phone = CASE
    WHEN phone IS NULL THEN NULL
    ELSE '+15550000000'
  END,
  "name" = pg_temp.staging_alias_name("name");

UPDATE "CapOrderRecord"
SET
  "payerEmail" = CASE
    WHEN "payerEmail" IS NULL THEN NULL
    ELSE 'staging+' || md5(id) || '@example.invalid'
  END,
  "payerName" = pg_temp.staging_alias_name("payerName"),
  note = pg_temp.staging_scrub_known_names(pg_temp.staging_replace_exact(note, "payerName"));

UPDATE "ShirtOrderRecord"
SET
  "payerEmail" = CASE
    WHEN "payerEmail" IS NULL THEN NULL
    ELSE 'staging+' || md5(id) || '@example.invalid'
  END,
  "payerName" = pg_temp.staging_alias_name("payerName"),
  note = pg_temp.staging_scrub_known_names(pg_temp.staging_replace_exact(note, "payerName"));

UPDATE "MerchOrderDraft"
SET
  "contactEmail" = CASE
    WHEN "contactEmail" IS NULL THEN NULL
    ELSE 'staging+' || md5(id) || '@example.invalid'
  END,
  "createdByEmail" = CASE
    WHEN "createdByEmail" IS NULL THEN NULL
    ELSE 'staging+' || md5(id) || '@example.invalid'
  END,
  "playerName" = pg_temp.staging_alias_name("playerName"),
  "checkoutNote" = pg_temp.staging_scrub_known_names(pg_temp.staging_replace_exact("checkoutNote", "playerName"));

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
  END,
  "firstName" = pg_temp.staging_alias_name("firstName"),
  "lastName" = pg_temp.staging_alias_name("lastName"),
  "fullName" = pg_temp.staging_alias_name("fullName"),
  "guardianFirstName" = pg_temp.staging_alias_name("guardianFirstName"),
  "guardianLastName" = pg_temp.staging_alias_name("guardianLastName"),
  "birthDate" = pg_temp.staging_shift_birthdate("birthDate"),
  "streetAddress" = pg_temp.staging_scrub_street("streetAddress"),
  unit = NULL,
  city = CASE
    WHEN city IS NULL OR btrim(city) = '' THEN city
    ELSE 'Staging'
  END,
  state = CASE
    WHEN state IS NULL OR btrim(state) = '' THEN state
    ELSE 'ST'
  END,
  "postalCode" = CASE
    WHEN "postalCode" IS NULL OR btrim("postalCode") = '' THEN "postalCode"
    ELSE '00000'
  END,
  "sportsConnectRowKey" = CASE
    WHEN right("sportsConnectRowKey", char_length(id) + 2) = '::' || id THEN "sportsConnectRowKey"
    ELSE pg_temp.staging_scrub_row_key("sportsConnectRowKey") || '::' || id
  END;

-- rawRow repeats player/parent names, street addresses, birth dates, and
-- medical answers that the column updates above do not cover.
UPDATE "Enrollment"
SET "rawRow" = pg_temp.staging_scrub_json("rawRow")
WHERE "rawRow" IS NOT NULL;

-- explicitContacts is a JSON array of { email, name, ... }.
UPDATE "CommunicationAudienceRule"
SET "explicitContacts" = pg_temp.staging_scrub_json("explicitContacts")
WHERE "explicitContacts" IS NOT NULL;

UPDATE "TeamPlayerImportBatch"
SET "undoPayload" = pg_temp.staging_scrub_json("undoPayload")
WHERE "undoPayload" IS NOT NULL;

-- Last draft invite blast stores coach email lists.
UPDATE "DraftSession"
SET "lastInviteResult" = pg_temp.staging_scrub_json("lastInviteResult")
WHERE "lastInviteResult" IS NOT NULL;

UPDATE "CoachImportBatch"
SET "undoPayload" = pg_temp.staging_scrub_json("undoPayload")
WHERE "undoPayload" IS NOT NULL;

UPDATE "TeamListImportBatch"
SET "undoPayload" = pg_temp.staging_scrub_json("undoPayload")
WHERE "undoPayload" IS NOT NULL;

UPDATE "ScheduleDraftGame"
SET "scoreboardCheckoutName" = pg_temp.staging_alias_name("scoreboardCheckoutName");

UPDATE "Team"
SET "contactNotes" = pg_temp.staging_scrub_known_names("contactNotes")
WHERE "contactNotes" IS NOT NULL;

UPDATE "EquipmentCheckout"
SET notes = pg_temp.staging_scrub_known_names(notes)
WHERE notes IS NOT NULL;

-- Suffix the row id so two different names that normalize to one alias cannot
-- collide on (organization, season, age group, finding type).
UPDATE "PlayerNameCollisionReview"
SET "normalizedName" = CASE
  WHEN "normalizedName" ~ '^s[0-9a-f]{32}::.+' THEN "normalizedName"
  ELSE pg_temp.staging_alias_name("normalizedName") || '::' || id
END;

UPDATE "TripParticipant"
SET
  "inviteEmailTo" = CASE
    WHEN "inviteEmailTo" IS NULL THEN NULL
    ELSE 'staging+' || md5(id) || '@example.invalid'
  END,
  "playerFullName" = pg_temp.staging_alias_name("playerFullName"),
  "inviteToken" = 'st' || md5(id);

UPDATE "TripResponse"
SET
  "submitterEmail" = CASE
    WHEN "submitterEmail" IS NULL THEN NULL
    ELSE 'staging+' || md5(id) || '@example.invalid'
  END,
  "submitterPhone" = CASE
    WHEN "submitterPhone" IS NULL THEN NULL
    ELSE '+15550000000'
  END,
  "submitterName" = pg_temp.staging_alias_name("submitterName"),
  "answersJson" = pg_temp.staging_scrub_json_text("answersJson");

UPDATE "SurveyResponse"
SET
  "respondentEmail" = CASE
    WHEN "respondentEmail" IS NULL THEN NULL
    ELSE 'staging+' || md5(id) || '@example.invalid'
  END,
  "contactPhone" = CASE
    WHEN "contactPhone" IS NULL THEN NULL
    ELSE '+15550000000'
  END,
  "contactName" = pg_temp.staging_alias_name("contactName");

UPDATE "SurveyAnswer" AS a
SET
  "textValue" = NULL,
  "stringValue" = NULL
FROM "SurveyQuestion" AS q
WHERE a."questionId" = q.id
  AND q."questionText" ~* '(medical|allerg|medication|\yhealth\y|describe the condition|physical condition|tetanus|immuni[sz]|vaccin|shot date|condition|physician|insur|\ydoctor\y)'
  AND (a."textValue" IS NOT NULL OR a."stringValue" IS NOT NULL);

UPDATE "CoachPlayerProtection"
SET
  "guardianEmail" = CASE
    WHEN "guardianEmail" IS NULL THEN NULL
    ELSE 'staging+' || md5(id) || '@example.invalid'
  END,
  "playerName" = pg_temp.staging_alias_name("playerName");

UPDATE "DraftPlayerPool"
SET
  "guardianEmail" = CASE
    WHEN "guardianEmail" IS NULL THEN NULL
    ELSE 'staging+' || md5(id) || '@example.invalid'
  END,
  "guardianPhone" = CASE
    WHEN "guardianPhone" IS NULL THEN NULL
    ELSE '+15550000000'
  END,
  "firstName" = pg_temp.staging_alias_name("firstName"),
  "lastName" = pg_temp.staging_alias_name("lastName"),
  "fullName" = pg_temp.staging_alias_name("fullName"),
  "birthDate" = pg_temp.staging_shift_birthdate("birthDate"),
  notes = pg_temp.staging_scrub_known_names(notes);

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
