import { NextRequest, NextResponse } from "next/server";

import { resolveCommunicationActor } from "@/lib/communications/authz";
import { campaignSendsEmail } from "@/lib/communications/channels";
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
      const result = campaignSendsEmail(campaign.channels)
        ? await sendCampaignEmails(campaign)
        : { sent: 0, failed: 0, total: 0 };
      await prisma.communicationCampaign.update({
        where: { id: campaign.id },
        data: {
          status: result.failed > 0 ? "FAILED" : result.sent > 0 ? "SENT" : "CANCELED",
          ...(result.sent > 0 ? { sentAt: new Date() } : {}),
        },
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
