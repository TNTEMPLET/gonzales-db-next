// Bootstrap a genuinely fresh, empty database (no existing schema, no
// _prisma_migrations history) through the full migration history.
//
// Why this script exists: three historical migrations have latent bugs that
// only surface when replaying the ENTIRE history from absolute zero — every
// real environment (dev, preview, prod) reached its current state
// incrementally over time and never hit these:
//
//   1. 20260430162005_team_player_detailed_profile_fields alters "TeamPlayer"
//      before 20260430170000_add_teams_and_coachs_corner_models creates it —
//      a file-timestamp ordering bug between two migrations from the same day.
//   2. 20260729000000_global_registered_user_identity references
//      e.googleSub unquoted inside ORDER BY clauses; Postgres folds unquoted
//      identifiers to lowercase, which doesn't match the actual "googleSub"
//      column.
//   3. The same migration also does `ON CONFLICT ("email")` before the
//      unique index enabling that conflict target is created, later in the
//      same file.
//
// None of these are fixed by editing or renaming the historical migration
// files: real environments have already applied them (in whatever order
// actually worked when first deployed), and editing content changes a
// migration's checksum while renaming changes the name Prisma uses to match
// against `_prisma_migrations` — either breaks drift detection for anyone
// with existing history. A later migration can't fix this either, since
// `prisma migrate deploy` replays strictly in file order and fails at the
// broken migration before a later "fix" would ever run.
//
// So: this script runs `prisma migrate deploy`, and if it fails at one of
// these three known points, applies the documented correction directly
// against the database, marks that migration resolved, and continues —
// without ever touching the committed migration files. Safe to run
// repeatedly; each corrective step only fires if that specific migration is
// the one that just failed.
//
// Usage: DATABASE_URL=<fresh-db-url> node scripts/bootstrap-fresh-database.mjs

import { spawnSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[bootstrap] DATABASE_URL is not set — refusing to run.");
  process.exit(1);
}

const { Client } = await import("pg");

async function runSql(sql) {
  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function migrateDeploy() {
  return spawnSync("npx", ["prisma", "migrate", "deploy"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
}

function resolveApplied(migrationName) {
  const result = spawnSync(
    "npx",
    ["prisma", "migrate", "resolve", "--applied", migrationName],
    { encoding: "utf8", shell: process.platform === "win32" },
  );
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(output);
  if (result.status !== 0 && !output.includes("is already recorded as applied")) {
    throw new Error(`Failed to resolve ${migrationName} as applied`);
  }
}

function resolveRolledBack(migrationName) {
  spawnSync(
    "npx",
    ["prisma", "migrate", "resolve", "--rolled-back", migrationName],
    { stdio: "inherit", shell: process.platform === "win32" },
  );
}

// Corrective SQL for each known-broken migration, applied in place of the
// committed file's content when that specific migration is the one that
// failed during a from-scratch replay.
const FIXES = {
  "20260430162005_team_player_detailed_profile_fields": {
    // Match on the migration name Prisma reports failing, not the specific
    // inner DB error — a retry can fail at a different statement within the
    // same migration depending on exactly how much of a prior attempt landed
    // (e.g. "TeamPlayer does not exist" on a first try, but "index ... does
    // not exist" on a retry where an earlier statement already ran). Either
    // way, the same idempotent fix below is the correct response.
    detect: (output) =>
      output.includes(
        "Migration name: 20260430162005_team_player_detailed_profile_fields",
      ),
    apply: async () => {
      console.log(
        "[bootstrap] Applying 20260430170000_add_teams_and_coachs_corner_models out of order (creates TeamPlayer), " +
          "then the corrected 20260430162005 column additions.",
      );
      // Idempotent throughout, both because this fix itself may need a retry
      // after a transient network blip against the pooled gateway, and
      // because a partial prior attempt may have already created some of
      // these objects.
      await runSql(`
        DO $$ BEGIN
          CREATE TYPE "TeamCoachRole" AS ENUM ('HEAD_COACH', 'ASSISTANT_COACH');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;

        CREATE TABLE IF NOT EXISTS "Team" (
            "id" TEXT NOT NULL,
            "organizationId" TEXT NOT NULL,
            "seasonYear" INTEGER NOT NULL,
            "ageGroup" TEXT NOT NULL,
            "teamName" TEXT NOT NULL,
            "contactNotes" TEXT,
            "practicePlan" TEXT,
            "createdByAdminId" TEXT,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL,
            CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
        );

        CREATE TABLE IF NOT EXISTS "TeamCoachAssignment" (
            "id" TEXT NOT NULL,
            "teamId" TEXT NOT NULL,
            "registeredUserId" TEXT NOT NULL,
            "role" "TeamCoachRole" NOT NULL DEFAULT 'ASSISTANT_COACH',
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL,
            CONSTRAINT "TeamCoachAssignment_pkey" PRIMARY KEY ("id")
        );

        CREATE TABLE IF NOT EXISTS "TeamPlayer" (
            "id" TEXT NOT NULL,
            "teamId" TEXT NOT NULL,
            "firstName" TEXT,
            "lastName" TEXT,
            "fullName" TEXT NOT NULL,
            "contactPhone" TEXT,
            "rosterStatus" TEXT,
            "jerseyNumber" TEXT,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL,
            CONSTRAINT "TeamPlayer_pkey" PRIMARY KEY ("id")
        );

        CREATE TABLE IF NOT EXISTS "TeamGameNote" (
            "id" TEXT NOT NULL,
            "teamId" TEXT NOT NULL,
            "gameExternalId" TEXT NOT NULL,
            "note" TEXT,
            "availabilityNote" TEXT,
            "authoredByUserId" TEXT NOT NULL,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL,
            CONSTRAINT "TeamGameNote_pkey" PRIMARY KEY ("id")
        );

        CREATE UNIQUE INDEX IF NOT EXISTS "Team_organizationId_seasonYear_ageGroup_teamName_key" ON "Team"("organizationId", "seasonYear", "ageGroup", "teamName");
        CREATE INDEX IF NOT EXISTS "Team_organizationId_seasonYear_ageGroup_idx" ON "Team"("organizationId", "seasonYear", "ageGroup");
        CREATE UNIQUE INDEX IF NOT EXISTS "TeamCoachAssignment_teamId_registeredUserId_key" ON "TeamCoachAssignment"("teamId", "registeredUserId");
        CREATE INDEX IF NOT EXISTS "TeamCoachAssignment_registeredUserId_role_idx" ON "TeamCoachAssignment"("registeredUserId", "role");
        CREATE INDEX IF NOT EXISTS "TeamPlayer_teamId_fullName_idx" ON "TeamPlayer"("teamId", "fullName");
        CREATE UNIQUE INDEX IF NOT EXISTS "TeamGameNote_teamId_gameExternalId_key" ON "TeamGameNote"("teamId", "gameExternalId");
        CREATE INDEX IF NOT EXISTS "TeamGameNote_authoredByUserId_updatedAt_idx" ON "TeamGameNote"("authoredByUserId", "updatedAt");

        DO $$ BEGIN
          ALTER TABLE "Team" ADD CONSTRAINT "Team_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        DO $$ BEGIN
          ALTER TABLE "TeamCoachAssignment" ADD CONSTRAINT "TeamCoachAssignment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        DO $$ BEGIN
          ALTER TABLE "TeamCoachAssignment" ADD CONSTRAINT "TeamCoachAssignment_registeredUserId_fkey" FOREIGN KEY ("registeredUserId") REFERENCES "RegisteredUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        DO $$ BEGIN
          ALTER TABLE "TeamPlayer" ADD CONSTRAINT "TeamPlayer_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        DO $$ BEGIN
          ALTER TABLE "TeamGameNote" ADD CONSTRAINT "TeamGameNote_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        DO $$ BEGIN
          ALTER TABLE "TeamGameNote" ADD CONSTRAINT "TeamGameNote_authoredByUserId_fkey" FOREIGN KEY ("authoredByUserId") REFERENCES "RegisteredUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      `);
      resolveApplied("20260430170000_add_teams_and_coachs_corner_models");

      // Idempotent rewrite of this migration's content: Prisma's own failed
      // attempt (before this fix ran) already executed the DropIndex and
      // AlterTable...DROP DEFAULT statements incrementally before failing on
      // the ADD COLUMN block (this connection/adapter doesn't run a whole
      // migration.sql as one atomic transaction), so re-running the raw file
      // verbatim would error on "index does not exist". IF EXISTS/IF NOT
      // EXISTS guards make this safe regardless of what already landed.
      await runSql(`
        DROP INDEX IF EXISTS "AllStarVaultAccess_role_updatedAt_idx";
        ALTER TABLE "AllStarVaultAccess" ALTER COLUMN "organizationId" DROP DEFAULT;
        ALTER TABLE "TeamPlayer" ADD COLUMN IF NOT EXISTS "birthCertificateStatus" TEXT,
        ADD COLUMN IF NOT EXISTS "birthDate" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "city" TEXT,
        ADD COLUMN IF NOT EXISTS "codeOfConductAccepted" BOOLEAN,
        ADD COLUMN IF NOT EXISTS "gender" TEXT,
        ADD COLUMN IF NOT EXISTS "guardianEmail" TEXT,
        ADD COLUMN IF NOT EXISTS "guardianFirstName" TEXT,
        ADD COLUMN IF NOT EXISTS "guardianLastName" TEXT,
        ADD COLUMN IF NOT EXISTS "guardianPhone" TEXT,
        ADD COLUMN IF NOT EXISTS "jerseySize" TEXT,
        ADD COLUMN IF NOT EXISTS "liabilityWaiverAccepted" BOOLEAN,
        ADD COLUMN IF NOT EXISTS "medicalConditionsDetails" TEXT,
        ADD COLUMN IF NOT EXISTS "medicalConditionsSummary" TEXT,
        ADD COLUMN IF NOT EXISTS "medicalTreatmentAuthorized" BOOLEAN,
        ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT,
        ADD COLUMN IF NOT EXISTS "playedPriorSeason" BOOLEAN,
        ADD COLUMN IF NOT EXISTS "postalCode" TEXT,
        ADD COLUMN IF NOT EXISTS "priorSeasonTeamInfo" TEXT,
        ADD COLUMN IF NOT EXISTS "refundPolicyAccepted" BOOLEAN,
        ADD COLUMN IF NOT EXISTS "registrationOrderDate" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "registrationOrderNo" TEXT,
        ADD COLUMN IF NOT EXISTS "state" TEXT,
        ADD COLUMN IF NOT EXISTS "streetAddress" TEXT,
        ADD COLUMN IF NOT EXISTS "unit" TEXT;
      `);
      resolveApplied("20260430162005_team_player_detailed_profile_fields");
    },
  },
  "20260729000000_global_registered_user_identity": {
    // Same reasoning as above: match on migration name, not inner error text.
    detect: (output) =>
      output.includes(
        "Migration name: 20260729000000_global_registered_user_identity",
      ),
    apply: async () => {
      console.log(
        "[bootstrap] Applying 20260729000000_global_registered_user_identity with quoted " +
          "e.\"googleSub\" and the email unique index created before the backfill INSERT.",
      );
      // Idempotent throughout: this migration previously failed partway
      // through on this same box (unquoted e.googleSub), and this adapter
      // does not run a whole migration.sql as one atomic transaction, so
      // some of these objects may already exist from that earlier attempt.
      await runSql(`
        CREATE TABLE IF NOT EXISTS "RegisteredUserOrgProfile" (
            "id" TEXT NOT NULL,
            "registeredUserId" TEXT NOT NULL,
            "organizationId" TEXT NOT NULL,
            "isCoach" BOOLEAN NOT NULL DEFAULT false,
            "ageGroup" TEXT,
            "assignedTeam" TEXT,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL,
            CONSTRAINT "RegisteredUserOrgProfile_pkey" PRIMARY KEY ("id")
        );

        DO $$ BEGIN
          ALTER TABLE "RegisteredUserOrgProfile" ADD CONSTRAINT "RegisteredUserOrgProfile_registeredUserId_fkey"
            FOREIGN KEY ("registeredUserId") REFERENCES "RegisteredUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;

        CREATE UNIQUE INDEX IF NOT EXISTS "RegisteredUserOrgProfile_registeredUserId_organizationId_key"
            ON "RegisteredUserOrgProfile"("registeredUserId", "organizationId");

        CREATE INDEX IF NOT EXISTS "RegisteredUserOrgProfile_organizationId_idx"
            ON "RegisteredUserOrgProfile"("organizationId");

        CREATE INDEX IF NOT EXISTS "RegisteredUserOrgProfile_registeredUserId_idx"
            ON "RegisteredUserOrgProfile"("registeredUserId");

        -- Fix: drop old per-org uniqueness and add the new global email uniqueness
        -- BEFORE the backfill below, since it relies on ON CONFLICT ("email").
        DROP INDEX IF EXISTS "RegisteredUser_organizationId_email_key";
        CREATE UNIQUE INDEX IF NOT EXISTS "RegisteredUser_email_key" ON "RegisteredUser"("email");

        INSERT INTO "RegisteredUser" ("id", "email", "name", "firstName", "lastName", "isBlocked", "contactPhone", "googleSub", "passwordHash", "avatarUrl",
          "abuseAwarenessTrainingCertificateUrl", "abuseAwarenessTrainingCertificateFileName",
          "abuseAwarenessTrainingCertificateMimeType", "abuseAwarenessTrainingCertificateUploadedAt",
          "duplicateReviewPending", "createdAt", "updatedAt")
        SELECT
            gen_random_uuid()::text AS id,
            lower(trim(e.email)) AS email,
            (array_agg(e.name ORDER BY (e."googleSub" IS NOT NULL) DESC, e."updatedAt" DESC))[1] AS name,
            (array_agg(e."firstName" ORDER BY (e."googleSub" IS NOT NULL) DESC, e."updatedAt" DESC))[1] AS "firstName",
            (array_agg(e."lastName" ORDER BY (e."googleSub" IS NOT NULL) DESC, e."updatedAt" DESC))[1] AS "lastName",
            bool_or(e."isBlocked") AS "isBlocked",
            (array_agg(e."contactPhone" ORDER BY (e."googleSub" IS NOT NULL) DESC, e."updatedAt" DESC))[1] AS "contactPhone",
            (array_agg(e."googleSub" ORDER BY (e."googleSub" IS NOT NULL) DESC, e."updatedAt" DESC) FILTER (WHERE e."googleSub" IS NOT NULL))[1] AS "googleSub",
            (array_agg(e."passwordHash" ORDER BY (e."googleSub" IS NOT NULL) DESC, e."updatedAt" DESC))[1] AS "passwordHash",
            (array_agg(e."avatarUrl" ORDER BY (e."googleSub" IS NOT NULL) DESC, e."updatedAt" DESC))[1] AS "avatarUrl",
            (array_agg(e."abuseAwarenessTrainingCertificateUrl" ORDER BY (e."googleSub" IS NOT NULL) DESC, e."updatedAt" DESC))[1] AS "abuseAwarenessTrainingCertificateUrl",
            (array_agg(e."abuseAwarenessTrainingCertificateFileName" ORDER BY (e."googleSub" IS NOT NULL) DESC, e."updatedAt" DESC))[1] AS "abuseAwarenessTrainingCertificateFileName",
            (array_agg(e."abuseAwarenessTrainingCertificateMimeType" ORDER BY (e."googleSub" IS NOT NULL) DESC, e."updatedAt" DESC))[1] AS "abuseAwarenessTrainingCertificateMimeType",
            (array_agg(e."abuseAwarenessTrainingCertificateUploadedAt" ORDER BY (e."googleSub" IS NOT NULL) DESC, e."updatedAt" DESC))[1] AS "abuseAwarenessTrainingCertificateUploadedAt",
            bool_or(e."duplicateReviewPending") AS "duplicateReviewPending",
            min(e."createdAt") AS "createdAt",
            max(e."updatedAt") AS "updatedAt"
        FROM "RegisteredUser" e
        WHERE e.email IS NOT NULL AND trim(e.email) <> ''
        GROUP BY lower(trim(e.email))
        ON CONFLICT ("email") DO NOTHING;

        INSERT INTO "RegisteredUserOrgProfile" ("id", "registeredUserId", "organizationId", "isCoach", "ageGroup", "assignedTeam", "createdAt", "updatedAt")
        SELECT
            gen_random_uuid()::text,
            ru.id,
            old."organizationId",
            bool_or(COALESCE(old."isCoach", false)) AS "isCoach",
            (array_agg(old."ageGroup" ORDER BY old."updatedAt" DESC))[1] AS "ageGroup",
            (array_agg(old."assignedTeam" ORDER BY old."updatedAt" DESC))[1] AS "assignedTeam",
            min(old."createdAt"),
            max(old."updatedAt")
        FROM "RegisteredUser" old
        JOIN "RegisteredUser" ru ON lower(trim(ru.email)) = lower(trim(old.email))
        WHERE old."organizationId" IS NOT NULL
        GROUP BY ru.id, old."organizationId"
        ON CONFLICT ("registeredUserId", "organizationId") DO NOTHING;

        DROP INDEX IF EXISTS "RegisteredUser_organizationId_idx";
        DROP INDEX IF EXISTS "RegisteredUser_organizationId_duplicateReviewPending_idx";

        ALTER TABLE "RegisteredUser" DROP COLUMN IF EXISTS "organizationId";
        ALTER TABLE "RegisteredUser" DROP COLUMN IF EXISTS "isCoach";
        ALTER TABLE "RegisteredUser" DROP COLUMN IF EXISTS "ageGroup";
        ALTER TABLE "RegisteredUser" DROP COLUMN IF EXISTS "assignedTeam";
      `);
      resolveApplied("20260729000000_global_registered_user_identity");
    },
  },
};

// Generous headroom: each known fix may need one attempt to detect + one to
// apply, plus a recovery attempt if a prior run was interrupted mid-fix.
const MAX_ATTEMPTS = Object.keys(FIXES).length * 5 + 5;

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  console.log(`[bootstrap] prisma migrate deploy (attempt ${attempt})`);
  const result = migrateDeploy();
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");

  if (result.status === 0) {
    console.log("[bootstrap] All migrations applied successfully.");
    process.exit(0);
  }

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

  // P1001: transient connectivity blip against the pooled gateway. Back off
  // briefly and retry the same step rather than treating it as a hard stop.
  if (output.includes("P1001") || output.includes("Can't reach database server")) {
    console.warn("[bootstrap] Transient connection error (P1001). Waiting 5s and retrying.");
    await sleep(5000);
    continue;
  }

  // P3009: a previous run of this script (or a prior manual attempt) left a
  // failed migration marker — e.g. this script's own `resolveApplied` call
  // was interrupted by a transient network blip after the SQL already ran.
  // Recover by clearing that marker for any of our known migrations and
  // retrying; the next attempt will hit the same underlying P3018 error and
  // route into the matching fix below (whose SQL is idempotent either way).
  const p3009Match = output.match(
    /The `([^`]+)` migration started at .+ failed/,
  );
  if (p3009Match && FIXES[p3009Match[1]]) {
    console.log(
      `[bootstrap] Found a failed-migration marker for ${p3009Match[1]} from an interrupted prior run. Clearing it and retrying.`,
    );
    resolveRolledBack(p3009Match[1]);
    continue;
  }

  const matched = Object.entries(FIXES).find(([, fix]) => fix.detect(output));
  if (!matched) {
    console.error(
      "[bootstrap] migrate deploy failed with an error this script doesn't know how to fix. Stopping.",
    );
    process.exit(result.status ?? 1);
  }

  const [migrationName, fix] = matched;
  console.log(`[bootstrap] Detected known issue in ${migrationName}, applying documented fix...`);
  try {
    await fix.apply();
  } catch (err) {
    // Likely a transient network blip against the pooled gateway partway
    // through the fix (e.g. the SQL landed but the follow-up `migrate
    // resolve --applied` call didn't). The fix's SQL is idempotent, so
    // just retry the whole attempt rather than crashing.
    console.warn(
      `[bootstrap] Fix for ${migrationName} hit an error (${err.message}); waiting 5s and retrying.`,
    );
    await sleep(5000);
  }
}

console.error("[bootstrap] Exhausted known fixes without a clean deploy. Stopping.");
process.exit(1);
