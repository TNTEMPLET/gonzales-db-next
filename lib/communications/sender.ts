import type { CommunicationCampaign, CommunicationDeliveryStatus } from "@prisma/client";

import prisma from "@/lib/prisma";

import { resolveFromAddress } from "./fromAddresses";
import { sendEmailViaResend } from "./providers/resend";
import { createUnsubscribeToken } from "./unsubscribeToken";

function deliveryStatusFromErrorMessage(message: string): CommunicationDeliveryStatus {
  if (message.includes("consent")) return "SKIPPED_NO_CONSENT";
  if (message.includes("suppress")) return "SKIPPED_SUPPRESSED";
  if (message.includes("contact")) return "SKIPPED_NO_CONTACT";
  return "FAILED";
}

export async function sendCampaignEmails(campaign: CommunicationCampaign) {
  const snapshots = await prisma.communicationRecipientSnapshot.findMany({
    where: { campaignId: campaign.id },
    orderBy: { createdAt: "asc" },
  });

  const fromAddress = await resolveFromAddress(campaign.fromEmail);

  let sent = 0;
  let failed = 0;
  for (const snapshot of snapshots) {
    const email = snapshot.email?.trim().toLowerCase() || "";
    if (!email) {
      failed += 1;
      await prisma.communicationDelivery.create({
        data: {
          campaignId: campaign.id,
          channel: "EMAIL",
          recipientType: snapshot.recipientType,
          registeredUserId: snapshot.registeredUserId,
          adminUserId: snapshot.adminUserId,
          toEmail: snapshot.email,
          status: "SKIPPED_NO_CONTACT",
          errorMessage: "No email contact available",
        },
      });
      continue;
    }

    const suppressed = await prisma.emailSuppression.findFirst({
      where: {
        email,
        organizationId: campaign.organizationId ?? null,
      },
      select: { id: true },
    });
    if (suppressed) {
      failed += 1;
      await prisma.communicationDelivery.create({
        data: {
          campaignId: campaign.id,
          channel: "EMAIL",
          recipientType: snapshot.recipientType,
          registeredUserId: snapshot.registeredUserId,
          adminUserId: snapshot.adminUserId,
          toEmail: email,
          status: "SKIPPED_SUPPRESSED",
          errorMessage: "Email is suppressed",
        },
      });
      continue;
    }

    const unsubscribeToken = createUnsubscribeToken({
      email,
      organizationId: campaign.organizationId,
      channel: "EMAIL",
    });
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const unsubUrl =
      baseUrl && unsubscribeToken
        ? `${baseUrl}/api/admin/communications/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`
        : null;
    const html = `${campaign.messageBody.replaceAll("\n", "<br/>")}${
      unsubUrl
        ? `<hr/><p style="font-size:12px;color:#666">Unsubscribe: <a href="${unsubUrl}">${unsubUrl}</a></p>`
        : ""
    }`;

    try {
      const providerResponse = await sendEmailViaResend({
        to: email,
        subject: campaign.messageSubject || campaign.title,
        html,
        text: campaign.messageBody,
        from: fromAddress,
      });
      sent += 1;
      await prisma.communicationDelivery.create({
        data: {
          campaignId: campaign.id,
          channel: "EMAIL",
          recipientType: snapshot.recipientType,
          registeredUserId: snapshot.registeredUserId,
          adminUserId: snapshot.adminUserId,
          toEmail: email,
          provider: providerResponse.provider,
          providerMessageId: providerResponse.providerMessageId,
          status: "SENT",
          attemptedAt: new Date(),
          sentAt: new Date(),
        },
      });
    } catch (err: unknown) {
      failed += 1;
      const message = err instanceof Error ? err.message : "Email send failed";
      await prisma.communicationDelivery.create({
        data: {
          campaignId: campaign.id,
          channel: "EMAIL",
          recipientType: snapshot.recipientType,
          registeredUserId: snapshot.registeredUserId,
          adminUserId: snapshot.adminUserId,
          toEmail: email,
          status: deliveryStatusFromErrorMessage(message),
          errorMessage: message,
          attemptedAt: new Date(),
        },
      });
    }
  }

  return { sent, failed, total: snapshots.length };
}
