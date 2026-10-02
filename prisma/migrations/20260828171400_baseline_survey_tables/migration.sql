-- Survey tables were created with db push and never had a CREATE TABLE migration.
-- 20260828171500 (and the two migrations after it) ALTER "SurveyResponse", which
-- fails on an empty database. This runs immediately before those alters.
--
-- "SurveyResponse" is created WITHOUT the columns those later migrations add
-- (wantsBoardContact, contactPhone, contactName, contactPreferredMethod,
-- contactBestTime, contactedAt, contactedByAdminId) so the alters still apply
-- on a from-scratch replay.
--
-- Idempotent: databases that already have these tables (db push or a previous
-- deploy) skip creation. Pending on those databases, so migrate deploy runs it
-- once; IF NOT EXISTS keeps that run from failing.

DO $$ BEGIN
  CREATE TYPE "SurveySeason" AS ENUM ('SPRING', 'FALL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Survey" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "season" "SurveySeason" NOT NULL DEFAULT 'SPRING',
    "seasonYear" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "slug" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Survey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SurveySection" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "SurveySection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SurveyQuestion" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "questionText" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "matrixTopics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "SurveyQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SurveyResponse" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "organizationId" TEXT,
    "respondentEmail" TEXT,
    "divisionName" TEXT,
    "ageGroup" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SurveyAnswer" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "matrixTopic" TEXT,
    "textValue" TEXT,
    "numberValue" DOUBLE PRECISION,
    "stringValue" TEXT,

    CONSTRAINT "SurveyAnswer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Survey_organizationId_seasonYear_season_idx" ON "Survey"("organizationId", "seasonYear", "season");
CREATE UNIQUE INDEX IF NOT EXISTS "Survey_organizationId_slug_key" ON "Survey"("organizationId", "slug");
CREATE INDEX IF NOT EXISTS "SurveySection_surveyId_order_idx" ON "SurveySection"("surveyId", "order");
CREATE INDEX IF NOT EXISTS "SurveyQuestion_sectionId_order_idx" ON "SurveyQuestion"("sectionId", "order");
CREATE INDEX IF NOT EXISTS "SurveyResponse_surveyId_submittedAt_idx" ON "SurveyResponse"("surveyId", "submittedAt");
CREATE INDEX IF NOT EXISTS "SurveyResponse_surveyId_organizationId_submittedAt_idx" ON "SurveyResponse"("surveyId", "organizationId", "submittedAt");
CREATE INDEX IF NOT EXISTS "SurveyAnswer_responseId_idx" ON "SurveyAnswer"("responseId");
CREATE INDEX IF NOT EXISTS "SurveyAnswer_questionId_idx" ON "SurveyAnswer"("questionId");

DO $$ BEGIN
  ALTER TABLE "SurveySection" ADD CONSTRAINT "SurveySection_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SurveyQuestion" ADD CONSTRAINT "SurveyQuestion_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "SurveySection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SurveyAnswer" ADD CONSTRAINT "SurveyAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "SurveyResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SurveyAnswer" ADD CONSTRAINT "SurveyAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "SurveyQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
