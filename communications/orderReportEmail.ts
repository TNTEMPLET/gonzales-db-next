import prisma from "@/lib/prisma";

import { isCommunicationsModuleEnabled } from "./config";
import { sendEmailViaResend, type ResendAttachment } from "./providers/resend";
import { isEmailSuppressed } from "./suppression";

export const ORDER_REPORT_MAX_RECIPIENTS = 10;

export type OrderReportSourceType =
  | "SHIRT_ORDER_MANUAL"
  | "CAP_ORDER_MANUAL"
  | "JERSEY_REPORT_MANUAL"
  | "DRAFT_INVITE_MANUAL";

/**
 * Governed replacement for a direct sendEmailViaResend() call from an admin
 * "email this report" button (Shirt/Cap Orders, Jersey Report). Unlike the
 * full Communications campaign flow, this skips the human approval workflow
 * entirely — it's a narrow carve-out for an already-module-gated,
 * low-volume, admin-authored transactional send, not a broadcast to an
 * audience rule. It still respects the module kill-switch and per-recipient
 * suppression, and it still writes a CommunicationCampaign/Delivery audit
 * trail so these sends show up in the Communications dashboard.
 *
 * One shared Resend call is made with all non-suppressed recipients in the
 * `to` array (matching the pre-existing shirt-orders behavior — this is an
 * internal/vendor report, not a public broadcast, so there's no unsubscribe
 * link requirement and no reason to fragment it into N calls). All resulting
 * CommunicationDelivery rows share the same provider/providerMessageId.
 */
export async function sendOrderReportEmail(params: {
  actorAdminId: string | null;
  actorEmail: string | null;
  organizationId: string | null;
  campaignTitlePrefix: "Shirt Orders" | "Cap Orders" | "Jersey Report" | "Draft Invite";
  sourceType: OrderReportSourceType;
  recipients: string[];
  subject: string;
  text: string;
  html: string;
  fromEmail?: string | null;
  replyTo?: string | null;
  attachments?: ResendAttachment[];
}): Promise<{
  campaignId: string;
  sent: number;
  skippedSuppressed: string[];
  failed: string[];
  providerMessageId: string | null;
}> {
  if (!isCommunicationsModuleEnabled()) {
    throw new Error("Communications module is disabled");
  }

  const recipients = Array.from(
    new Set(params.recipients.map((email) => email.trim().toLowerCase()).filter(Boolean)),
  );
  if (recipients.length === 0) {
    throw new Error("At least one recipient is required");
  }

  const suppressedFlags = await Promise.all(
    recipients.map((email) => isEmailSuppressed(email, params.organizationId)),
  );
  const skippedSuppressed = recipients.filter((_, i) => suppressedFlags[i]);
  const sendable = recipients.filter((_, i) => !suppressedFlags[i]);

  const campaign = await prisma.communicationCampaign.create({
    data: {
      organizationId: params.organizationId,
      logicalMode: "AND",
      channels: ["EMAIL"],
      status: "SENDING",
      title: `${params.campaignTitlePrefix} report ${new Date().toISOString().slice(0, 10)}`,
      messageSubject: params.subject,
      messageBody: params.text,
      fromEmail: params.fromEmail ?? null,
      createdByAdminId: params.actorAdminId,
      sentAt: new Date(),
      audienceRules: {
        create: [
          {
            ruleType: "EXPLICIT_CONTACTS",
            organizationId: params.organizationId,
            explicitContacts: recipients.map((email) => ({
              email,
              sourceType: params.sourceType,
            })),
          },
        ],
      },
    },
  });

  const skippedRows = skippedSuppressed.map((email) => ({
    campaignId: campaign.id,
    recipientType: "RAW_CONTACT" as const,
    sourceType: params.sourceType,
    email,
  }));
  if (skippedRows.length > 0) {
    await prisma.communicationRecipientSnapshot.createMany({
      data: skippedRows,
    });
    await prisma.communicationDelivery.createMany({
      data: skippedRows.map((row) => ({
        campaignId: campaign.id,
        channel: "EMAIL" as const,
        recipientType: row.recipientType,
        sourceType: row.sourceType,
        toEmail: row.email,
        status: "SKIPPED_SUPPRESSED" as const,
        errorMessage: "Email is suppressed",
      })),
    });
  }

  if (sendable.length > 0) {
    await prisma.communicationRecipientSnapshot.createMany({
      data: sendable.map((email) => ({
        campaignId: campaign.id,
        recipientType: "RAW_CONTACT" as const,
        sourceType: params.sourceType,
        email,
      })),
    });
  }

  let sent = 0;
  const failed: string[] = [];
  let providerMessageId: string | null = null;

  if (sendable.length > 0) {
    try {
      const result = await sendEmailViaResend({
        to: sendable,
        subject: params.subject,
        html: params.html,
        text: params.text,
        from: params.fromEmail,
        replyTo: params.replyTo,
        attachments: params.attachments,
      });
      sent = sendable.length;
      providerMessageId = result.providerMessageId;
      await prisma.communicationDelivery.createMany({
        data: sendable.map((email) => ({
          campaignId: campaign.id,
          channel: "EMAIL" as const,
          recipientType: "RAW_CONTACT" as const,
          sourceType: params.sourceType,
          toEmail: email,
          provider: result.provider,
          providerMessageId: result.providerMessageId,
          status: "SENT" as const,
          attemptedAt: new Date(),
          sentAt: new Date(),
        })),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Email send failed";
      failed.push(...sendable);
      await prisma.communicationDelivery.createMany({
        data: sendable.map((email) => ({
          campaignId: campaign.id,
          channel: "EMAIL" as const,
          recipientType: "RAW_CONTACT" as const,
          sourceType: params.sourceType,
          toEmail: email,
          status: "FAILED" as const,
          errorMessage: message,
          attemptedAt: new Date(),
        })),
      });
    }
  }

  await prisma.communicationCampaign.update({
    where: { id: campaign.id },
    data: { status: failed.length > 0 && sent === 0 ? "FAILED" : "SENT" },
  });

  if (failed.length > 0 && sent === 0) {
    throw new Error("Email send failed");
  }

  return { campaignId: campaign.id, sent, skippedSuppressed, failed, providerMessageId };
}
