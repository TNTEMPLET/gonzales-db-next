import { NextRequest, NextResponse } from "next/server";

import { resolveCommunicationActor } from "@/lib/communications/authz";
import { canSendForOrg } from "@/lib/communications/policy";
import { snapshotCampaignAudience } from "@/lib/communications/snapshotAudience";
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

  const snap = await snapshotCampaignAudience(campaign.id);

  await prisma.$transaction(async (tx) => {
    await tx.communicationApproval.create({
      data: {
        campaignId: campaign.id,
        status: "REQUESTED",
      },
    });

    await tx.communicationCampaign.update({
      where: { id: campaign.id },
      data: { status: "PENDING_APPROVAL" },
    });
  });

  return NextResponse.json({ success: true, recipients: snap.total });
}
