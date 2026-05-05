import { NextRequest, NextResponse } from "next/server";

import { resolveCommunicationActor } from "@/lib/communications/authz";
import { isSmsSendingEnabled } from "@/lib/communications/config";
import { isWithinQuietHours } from "@/lib/communications/policy";
import { sendCampaignEmails } from "@/lib/communications/sender";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const actor = await resolveCommunicationActor(request);
  if (!actor.ok) return NextResponse.json({ error: actor.message }, { status: actor.status });

  const now = new Date();
  const due = await prisma.communicationCampaign.findMany({
    where: {
      status: "SCHEDULED",
      sendAt: { lte: now },
      OR: [{ organizationId: actor.targetOrg }, { organizationId: null }],
    },
    orderBy: { sendAt: "asc" },
    take: 25,
  });

  const results: Array<{ campaignId: string; sent: number; failed: number; skipped?: string }> = [];
  for (const campaign of due) {
    if (isWithinQuietHours(now, campaign.quietHoursStart, campaign.quietHoursEnd)) {
      results.push({ campaignId: campaign.id, sent: 0, failed: 0, skipped: "quiet_hours" });
      continue;
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
        data: { status: result.failed > 0 ? "FAILED" : "SENT", sentAt: new Date() },
      });
      results.push({ campaignId: campaign.id, sent: result.sent, failed: result.failed });
    } catch (err: unknown) {
      await prisma.communicationCampaign.update({
        where: { id: campaign.id },
        data: { status: "FAILED" },
      });
      results.push({ campaignId: campaign.id, sent: 0, failed: 1, skipped: err instanceof Error ? err.message : "failed" });
    }
  }

  return NextResponse.json({ success: true, processed: results.length, results });
}
