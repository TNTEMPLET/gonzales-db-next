-- CreateTable
CREATE TABLE "TournamentRosterIntakeLink" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "bracketProjectId" TEXT,
    "teamName" TEXT NOT NULL,
    "ageGroup" TEXT,
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdByAdminId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentRosterIntakeLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentRosterSubmission" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "source" TEXT NOT NULL,
    "submitterName" TEXT,
    "submitterEmail" TEXT,
    "submitterPhone" TEXT,
    "notes" TEXT,
    "originalFilename" TEXT,
    "rawCsv" TEXT,
    "reviewedByAdminId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentRosterSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentRosterSubmissionPlayer" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "jerseyNumber" TEXT NOT NULL,
    "validationNotes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentRosterSubmissionPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TournamentRosterIntakeLink_tokenHash_key" ON "TournamentRosterIntakeLink"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "TRosterLink_org_season_project_team_key" ON "TournamentRosterIntakeLink"("organizationId", "seasonYear", "bracketProjectId", "teamName");

-- CreateIndex
CREATE INDEX "TRosterLink_org_season_project_idx" ON "TournamentRosterIntakeLink"("organizationId", "seasonYear", "bracketProjectId");

-- CreateIndex
CREATE INDEX "TRosterLink_status_updated_idx" ON "TournamentRosterIntakeLink"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "TRosterSubmission_link_status_created_idx" ON "TournamentRosterSubmission"("linkId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "TRosterSubmission_status_created_idx" ON "TournamentRosterSubmission"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TRosterPlayer_submission_row_idx" ON "TournamentRosterSubmissionPlayer"("submissionId", "rowNumber");

-- AddForeignKey
ALTER TABLE "TournamentRosterSubmission" ADD CONSTRAINT "TournamentRosterSubmission_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "TournamentRosterIntakeLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentRosterSubmissionPlayer" ADD CONSTRAINT "TournamentRosterSubmissionPlayer_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "TournamentRosterSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
