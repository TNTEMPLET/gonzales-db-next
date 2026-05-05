-- CreateEnum
CREATE TYPE "CommunicationChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "CommunicationCampaignStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "CommunicationApprovalStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CommunicationAudienceLogicalMode" AS ENUM ('AND', 'OR');

-- CreateEnum
CREATE TYPE "CommunicationAudienceRuleType" AS ENUM ('ALL_USERS', 'ORGANIZATION', 'ALL_COACHES', 'ORGANIZATION_COACHES', 'ADMIN_ROLE');

-- CreateEnum
CREATE TYPE "CommunicationRecipientType" AS ENUM ('REGISTERED_USER', 'ADMIN_USER');

-- CreateEnum
CREATE TYPE "CommunicationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED_SUPPRESSED', 'SKIPPED_NO_CONSENT', 'SKIPPED_NO_CONTACT');

-- CreateTable
CREATE TABLE "CommunicationCampaign" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "logicalMode" "CommunicationAudienceLogicalMode" NOT NULL DEFAULT 'OR',
    "channels" "CommunicationChannel"[],
    "status" "CommunicationCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "messageSubject" TEXT,
    "messageBody" TEXT NOT NULL,
    "createdByAdminId" TEXT,
    "createdByRegisteredUserId" TEXT,
    "sendAt" TIMESTAMP(3),
    "timezone" TEXT,
    "quietHoursStart" INTEGER,
    "quietHoursEnd" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunicationCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationAudienceRule" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "ruleType" "CommunicationAudienceRuleType" NOT NULL,
    "organizationId" TEXT,
    "adminRole" "AdminRole",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationAudienceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationApproval" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "approverAdminId" TEXT,
    "status" "CommunicationApprovalStatus" NOT NULL,
    "note" TEXT,
    "actedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationRecipientSnapshot" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "recipientType" "CommunicationRecipientType" NOT NULL,
    "registeredUserId" TEXT,
    "adminUserId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "matchReasons" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationRecipientSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationDelivery" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "recipientType" "CommunicationRecipientType" NOT NULL,
    "registeredUserId" TEXT,
    "adminUserId" TEXT,
    "toEmail" TEXT,
    "toPhone" TEXT,
    "provider" TEXT,
    "providerMessageId" TEXT,
    "status" "CommunicationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "attemptedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunicationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSuppression" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "registeredUserId" TEXT,
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsConsent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "registeredUserId" TEXT,
    "phone" TEXT NOT NULL,
    "consentedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunicationCampaign_status_sendAt_idx" ON "CommunicationCampaign"("status", "sendAt");

-- CreateIndex
CREATE INDEX "CommunicationCampaign_organizationId_createdAt_idx" ON "CommunicationCampaign"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunicationAudienceRule_campaignId_idx" ON "CommunicationAudienceRule"("campaignId");

-- CreateIndex
CREATE INDEX "CommunicationAudienceRule_ruleType_organizationId_adminRole_idx" ON "CommunicationAudienceRule"("ruleType", "organizationId", "adminRole");

-- CreateIndex
CREATE INDEX "CommunicationApproval_campaignId_status_idx" ON "CommunicationApproval"("campaignId", "status");

-- CreateIndex
CREATE INDEX "CommunicationApproval_approverAdminId_actedAt_idx" ON "CommunicationApproval"("approverAdminId", "actedAt");

-- CreateIndex
CREATE INDEX "CommunicationRecipientSnapshot_campaignId_idx" ON "CommunicationRecipientSnapshot"("campaignId");

-- CreateIndex
CREATE INDEX "CommunicationRecipientSnapshot_registeredUserId_idx" ON "CommunicationRecipientSnapshot"("registeredUserId");

-- CreateIndex
CREATE INDEX "CommunicationRecipientSnapshot_adminUserId_idx" ON "CommunicationRecipientSnapshot"("adminUserId");

-- CreateIndex
CREATE INDEX "CommunicationDelivery_campaignId_status_channel_idx" ON "CommunicationDelivery"("campaignId", "status", "channel");

-- CreateIndex
CREATE INDEX "CommunicationDelivery_registeredUserId_idx" ON "CommunicationDelivery"("registeredUserId");

-- CreateIndex
CREATE INDEX "CommunicationDelivery_adminUserId_idx" ON "CommunicationDelivery"("adminUserId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSuppression_organizationId_email_key" ON "EmailSuppression"("organizationId", "email");

-- CreateIndex
CREATE INDEX "EmailSuppression_email_createdAt_idx" ON "EmailSuppression"("email", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SmsConsent_organizationId_phone_key" ON "SmsConsent"("organizationId", "phone");

-- CreateIndex
CREATE INDEX "SmsConsent_registeredUserId_consentedAt_revokedAt_idx" ON "SmsConsent"("registeredUserId", "consentedAt", "revokedAt");

-- AddForeignKey
ALTER TABLE "CommunicationCampaign" ADD CONSTRAINT "CommunicationCampaign_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationCampaign" ADD CONSTRAINT "CommunicationCampaign_createdByRegisteredUserId_fkey" FOREIGN KEY ("createdByRegisteredUserId") REFERENCES "RegisteredUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationAudienceRule" ADD CONSTRAINT "CommunicationAudienceRule_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CommunicationCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationApproval" ADD CONSTRAINT "CommunicationApproval_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CommunicationCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationApproval" ADD CONSTRAINT "CommunicationApproval_approverAdminId_fkey" FOREIGN KEY ("approverAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationRecipientSnapshot" ADD CONSTRAINT "CommunicationRecipientSnapshot_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CommunicationCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationRecipientSnapshot" ADD CONSTRAINT "CommunicationRecipientSnapshot_registeredUserId_fkey" FOREIGN KEY ("registeredUserId") REFERENCES "RegisteredUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationRecipientSnapshot" ADD CONSTRAINT "CommunicationRecipientSnapshot_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationDelivery" ADD CONSTRAINT "CommunicationDelivery_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CommunicationCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationDelivery" ADD CONSTRAINT "CommunicationDelivery_registeredUserId_fkey" FOREIGN KEY ("registeredUserId") REFERENCES "RegisteredUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationDelivery" ADD CONSTRAINT "CommunicationDelivery_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSuppression" ADD CONSTRAINT "EmailSuppression_registeredUserId_fkey" FOREIGN KEY ("registeredUserId") REFERENCES "RegisteredUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsConsent" ADD CONSTRAINT "SmsConsent_registeredUserId_fkey" FOREIGN KEY ("registeredUserId") REFERENCES "RegisteredUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
