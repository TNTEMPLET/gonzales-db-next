import { NextRequest, NextResponse } from "next/server";

import { resolveCommunicationActor } from "@/lib/communications/authz";
import { isSmsSendingEnabled } from "@/lib/communications/config";
import { canSendForOrg, isWithinQuietHours } from "@/lib/communications/policy";
import { sendCampaignEmails } from "@/lib/communications/sender";
import prisma from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await resolveCommunicationActor(request);
  if (!actor.ok) return NextResponse.json({ error: actor.message }, { status: actor.status });
  const { id } = await params;

  const campaign = await prisma.communicationCampaign.findUnique({
    where: { id },
  });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (!canSendForOrg(actor.role, campaign.organizationId, actor.targetOrg)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (campaign.status !== "APPROVED" && campaign.status !== "SCHEDULED") {
    return NextResponse.json(
      { error: "Campaign must be approved before send" },
      { status: 409 },
    );
  }

  if (isWithinQuietHours(new Date(), campaign.quietHoursStart, campaign.quietHoursEnd)) {
    return NextResponse.json(
      { error: "Current time is within quiet hours for this campaign" },
      { status: 409 },
    );
  }

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
