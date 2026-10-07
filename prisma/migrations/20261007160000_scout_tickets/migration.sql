-- Scout email tickets. New tables only.

-- CreateEnum
CREATE TYPE "ScoutTicketStatus" AS ENUM ('NEW', 'OPEN', 'WAITING', 'DONE', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ScoutOrgTag" AS ENUM ('gonzales', 'ascension', 'fallball', 'master');

-- CreateTable
CREATE TABLE "ScoutTicket" (
    "id" TEXT NOT NULL,
    "mailbox" TEXT NOT NULL,
    "gmailThreadId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "senderEmail" TEXT NOT NULL,
    "senderName" TEXT,
    "firstMessageAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "snippet" TEXT NOT NULL,
    "gmailUrl" TEXT NOT NULL,
    "status" "ScoutTicketStatus" NOT NULL DEFAULT 'NEW',
    "orgTag" "ScoutOrgTag",
    "notes" TEXT,
    "assignedAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoutTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoutTicketMessage" (
    "id" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "senderEmail" TEXT NOT NULL,
    "senderName" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "snippet" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoutTicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoutSyncState" (
    "id" TEXT NOT NULL,
    "mailbox" TEXT NOT NULL,
    "lastHistoryId" TEXT,
    "cursor" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoutSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScoutTicket_mailbox_gmailThreadId_key" ON "ScoutTicket"("mailbox", "gmailThreadId");

-- CreateIndex
CREATE INDEX "ScoutTicket_mailbox_status_lastMessageAt_idx" ON "ScoutTicket"("mailbox", "status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "ScoutTicket_senderEmail_idx" ON "ScoutTicket"("senderEmail");

-- CreateIndex
CREATE UNIQUE INDEX "ScoutTicketMessage_gmailMessageId_key" ON "ScoutTicketMessage"("gmailMessageId");

-- CreateIndex
CREATE INDEX "ScoutTicketMessage_ticketId_receivedAt_idx" ON "ScoutTicketMessage"("ticketId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScoutSyncState_mailbox_key" ON "ScoutSyncState"("mailbox");

-- AddForeignKey
ALTER TABLE "ScoutTicketMessage" ADD CONSTRAINT "ScoutTicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ScoutTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
