-- Tables and columns that exist in schema.prisma but were only created with
-- db push, so a from-scratch migrate never built them. Statements are
-- idempotent: an environment that already has the object skips it.
-- SQL matches `prisma migrate diff --from-empty --to-schema --script` for
-- these objects (Prisma 7.8).

DO $$ BEGIN
  CREATE TYPE "AssignrSyncJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'PARTIAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AssignrSyncJobKind" AS ENUM ('GAMES_PUBLISH', 'GAMES_BULK_UPDATE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "TeamPlayer" ADD COLUMN IF NOT EXISTS "allStarAgeBand" TEXT;

CREATE INDEX IF NOT EXISTS "RegisteredUser_duplicateReviewPending_idx" ON "RegisteredUser"("duplicateReviewPending");

CREATE TABLE IF NOT EXISTS "TeamAllStarAgeCutoff" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "cutoffDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamAllStarAgeCutoff_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AssignrSyncJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "AssignrSyncJobKind" NOT NULL,
    "status" "AssignrSyncJobStatus" NOT NULL DEFAULT 'PENDING',
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB,
    "results" JSONB,
    "errorMessage" TEXT,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AssignrSyncJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AssignrAuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "assignrResource" TEXT NOT NULL,
    "assignrResourceId" TEXT,
    "requestSummary" JSONB,
    "responseSummary" JSONB,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "adminUserId" TEXT,
    "syncJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignrAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AllStarPageConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "paypalLinkLabel" TEXT,
    "paypalLinkUrl" TEXT,
    "infoText" TEXT,
    "links" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllStarPageConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AllStarPayment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ballotCycleId" TEXT NOT NULL,
    "candidateId" TEXT,
    "playerFullName" TEXT NOT NULL,
    "ageGroup" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "payerName" TEXT,
    "paypalTxId" TEXT,
    "paypalTxDate" TIMESTAMP(3),
    "paypalNote" TEXT,
    "amountCents" INTEGER NOT NULL DEFAULT 9500,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "markedPaidByAdminId" TEXT,
    "notes" TEXT,
    "rosterTag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllStarPayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CapOrderRecord" (
    "id" TEXT NOT NULL,
    "txId" TEXT NOT NULL,
    "org" TEXT NOT NULL,
    "payerName" TEXT,
    "payerEmail" TEXT,
    "amountCents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "itemName" TEXT,
    "txDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CapOrderRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CapOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "fulfilledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CapOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ParkInfoPage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rulesMarkdown" TEXT NOT NULL DEFAULT '',
    "parkingMarkdown" TEXT NOT NULL DEFAULT '',
    "fieldLayoutImageUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByAdminId" TEXT,

    CONSTRAINT "ParkInfoPage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TeamAllStarAgeCutoff_organizationId_seasonYear_idx" ON "TeamAllStarAgeCutoff"("organizationId", "seasonYear");
CREATE UNIQUE INDEX IF NOT EXISTS "TeamAllStarAgeCutoff_organizationId_seasonYear_key" ON "TeamAllStarAgeCutoff"("organizationId", "seasonYear");
CREATE INDEX IF NOT EXISTS "AssignrSyncJob_organizationId_status_createdAt_idx" ON "AssignrSyncJob"("organizationId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "AssignrAuditLog_organizationId_createdAt_idx" ON "AssignrAuditLog"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "AssignrAuditLog_syncJobId_idx" ON "AssignrAuditLog"("syncJobId");
CREATE UNIQUE INDEX IF NOT EXISTS "AllStarPageConfig_organizationId_key" ON "AllStarPageConfig"("organizationId");
CREATE INDEX IF NOT EXISTS "AllStarPayment_organizationId_ballotCycleId_idx" ON "AllStarPayment"("organizationId", "ballotCycleId");
CREATE INDEX IF NOT EXISTS "AllStarPayment_ballotCycleId_isPaid_idx" ON "AllStarPayment"("ballotCycleId", "isPaid");
CREATE UNIQUE INDEX IF NOT EXISTS "AllStarPayment_ballotCycleId_candidateId_key" ON "AllStarPayment"("ballotCycleId", "candidateId");
CREATE UNIQUE INDEX IF NOT EXISTS "CapOrderRecord_txId_key" ON "CapOrderRecord"("txId");
CREATE INDEX IF NOT EXISTS "CapOrderRecord_org_txDate_idx" ON "CapOrderRecord"("org", "txDate");
CREATE INDEX IF NOT EXISTS "CapOrderRecord_txDate_idx" ON "CapOrderRecord"("txDate");
CREATE INDEX IF NOT EXISTS "CapOrderItem_orderId_idx" ON "CapOrderItem"("orderId");
CREATE INDEX IF NOT EXISTS "CapOrderItem_status_idx" ON "CapOrderItem"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "CapOrderItem_orderId_seq_key" ON "CapOrderItem"("orderId", "seq");
CREATE UNIQUE INDEX IF NOT EXISTS "ParkInfoPage_organizationId_key" ON "ParkInfoPage"("organizationId");
CREATE INDEX IF NOT EXISTS "ParkInfoPage_organizationId_idx" ON "ParkInfoPage"("organizationId");

DO $$ BEGIN
  ALTER TABLE "AssignrSyncJob" ADD CONSTRAINT "AssignrSyncJob_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AssignrAuditLog" ADD CONSTRAINT "AssignrAuditLog_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AssignrAuditLog" ADD CONSTRAINT "AssignrAuditLog_syncJobId_fkey" FOREIGN KEY ("syncJobId") REFERENCES "AssignrSyncJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AllStarPayment" ADD CONSTRAINT "AllStarPayment_ballotCycleId_fkey" FOREIGN KEY ("ballotCycleId") REFERENCES "AllStarBallotCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AllStarPayment" ADD CONSTRAINT "AllStarPayment_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "AllStarCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AllStarPayment" ADD CONSTRAINT "AllStarPayment_markedPaidByAdminId_fkey" FOREIGN KEY ("markedPaidByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CapOrderItem" ADD CONSTRAINT "CapOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CapOrderRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ParkInfoPage" ADD CONSTRAINT "ParkInfoPage_updatedByAdminId_fkey" FOREIGN KEY ("updatedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
