import { NextRequest, NextResponse } from "next/server";

import { resolveCommunicationActor } from "@/lib/communications/authz";
import { canSendForOrg } from "@/lib/communications/policy";
import { resolveAudienceRecipients } from "@/lib/communications/resolver";
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
    include: { audienceRules: true },
  });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (!canSendForOrg(actor.role, campaign.organizationId, actor.targetOrg)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const resolved = await resolveAudienceRecipients({
    rules: campaign.audienceRules.map((rule) => ({
      ruleType: rule.ruleType,
      organizationId: rule.organizationId,
      adminRole: rule.adminRole,
      coachingInterestStatus: rule.coachingInterestStatus,
      explicitRegisteredUserIds: rule.explicitRegisteredUserIds,
    })),
    logicalMode: campaign.logicalMode,
  });

  const sample = resolved.recipients.slice(0, 100);
  return NextResponse.json({
    total: resolved.total,
    sample,
  });
}
