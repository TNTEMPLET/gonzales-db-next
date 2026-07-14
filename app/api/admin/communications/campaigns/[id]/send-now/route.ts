import { NextRequest, NextResponse } from "next/server";

import { resolveCommunicationActor } from "@/lib/communications/authz";
import { isSmsSendingEnabled } from "@/lib/communications/config";
import {
  canSendForOrg,
  canSendNowWithoutApproval,
  isWithinQuietHours,
} from "@/lib/communications/policy";
import { sendCampaignEmails } from "@/lib/communications/sender";
import { snapshotCampaignAudience } from "@/lib/communications/snapshotAudience";
import prisma from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await resolveCommunicationActor(request);
  if (!actor.ok) return NextResponse.json({ error: actor.message }, { status: actor.status });
  const { id } = await params;

  let campaign = await prisma.communicationCampaign.findUnique({
    where: { id },
  });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (!canSendForOrg(actor.role, campaign.organizationId, actor.targetOrg)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!canSendNowWithoutApproval(actor.role, campaign.status)) {
    return NextResponse.json(
      {
        error:
          campaign.status === "DRAFT" || campaign.status === "PENDING_APPROVAL"
            ? "Only Master Admin can send without approval"
            : "Campaign must be approved before send",
      },
      { status: 409 },
    );
  }

  if (isWithinQuietHours(new Date(), campaign.quietHoursStart, campaign.quietHoursEnd)) {
    return NextResponse.json(
      { error: "Current time is within quiet hours for this campaign" },
      { status: 409 },
    );
  }

  // Ensure recipient snapshots exist (Master path may skip submit-approval).
  const snapshotCount = await prisma.communicationRecipientSnapshot.count({
    where: { campaignId: campaign.id },
  });
  if (snapshotCount === 0) {
    const snap = await snapshotCampaignAudience(campaign.id);
    if (snap.total === 0) {
      return NextResponse.json({ error: "No recipients match this campaign audience" }, { status: 409 });
    }
  }

  campaign =
    (await prisma.communicationCampaign.findUnique({ where: { id: campaign.id } })) ?? campaign;

  await prisma.communicationCampaign.update({
    where: { id: campaign.id },
    data: { status: "SENDING" },
  });
  try {
    if (campaign.channels.includes("SMS") && !isSmsSendingEnabled()) {
      await prisma.communicationDelivery.create({
        data: {
          campaignId: campaign.id,
          channel: "SMS",
          recipientType: "ADMIN_USER",
          status: "SKIPPED_NO_CONSENT",
          errorMessage: "SMS disabled by COMMUNICATIONS_SMS_ENABLED flag",
        },
      });
    }
    const result = campaign.channels.includes("EMAIL")
      ? await sendCampaignEmails(campaign)
      : { sent: 0, failed: 0, total: 0 };

    await prisma.communicationCampaign.update({
      where: { id: campaign.id },
      data: {
        status: result.failed > 0 ? "FAILED" : "SENT",
        sentAt: new Date(),
        approvedAt: campaign.approvedAt ?? new Date(),
      },
    });

    return NextResponse.json({ success: true, result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Dispatch failed";
    await prisma.communicationCampaign.update({
      where: { id: campaign.id },
      data: { status: "FAILED" },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
