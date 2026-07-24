-- Travel / Regional trip intake (multi-org)
CREATE TABLE "TripFieldTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripFieldTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TripFieldTemplate_key_key" ON "TripFieldTemplate"("key");

CREATE TABLE "TripFieldDef" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sheetColumn" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "optionsJson" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "helpText" TEXT,
    "prefillFrom" TEXT,
    "adminOnly" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TripFieldDef_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TripFieldDef_templateId_key_key" ON "TripFieldDef"("templateId", "key");
CREATE INDEX "TripFieldDef_templateId_sortOrder_idx" ON "TripFieldDef"("templateId", "sortOrder");

CREATE TABLE "TripEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "teamLabel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "googleSheetId" TEXT,
    "googleSheetUrl" TEXT,
    "ballotCycleId" TEXT,
    "introMarkdown" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TripEvent_organizationId_status_idx" ON "TripEvent"("organizationId", "status");
CREATE INDEX "TripEvent_templateId_idx" ON "TripEvent"("templateId");

CREATE TABLE "TripParticipant" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "playerFullName" TEXT NOT NULL,
    "ageGroup" TEXT,
    "team" TEXT,
    "jerseyNumber" TEXT,
    "candidateId" TEXT,
    "paymentId" TEXT,
    "inviteToken" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripParticipant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TripParticipant_inviteToken_key" ON "TripParticipant"("inviteToken");
CREATE INDEX "TripParticipant_eventId_status_idx" ON "TripParticipant"("eventId", "status");
CREATE INDEX "TripParticipant_organizationId_eventId_idx" ON "TripParticipant"("organizationId", "eventId");

CREATE TABLE "TripResponse" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "answersJson" TEXT NOT NULL DEFAULT '{}',
    "submitterName" TEXT,
    "submitterEmail" TEXT,
    "submitterPhone" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripResponse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TripResponse_participantId_key" ON "TripResponse"("participantId");

ALTER TABLE "TripFieldDef" ADD CONSTRAINT "TripFieldDef_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TripFieldTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripEvent" ADD CONSTRAINT "TripEvent_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TripFieldTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TripParticipant" ADD CONSTRAINT "TripParticipant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TripEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripResponse" ADD CONSTRAINT "TripResponse_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "TripParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
