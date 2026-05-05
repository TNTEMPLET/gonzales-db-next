import { NextRequest, NextResponse } from "next/server";

import { resolveCommunicationActor } from "@/lib/communications/authz";
import { canApproveCampaign, canSendForOrg } from "@/lib/communications/policy";
import prisma from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await resolveCommunicationActor(request);
  if (!actor.ok) return NextResponse.json({ error: actor.message }, { status: actor.status });
  const { id } = await params;

  const body = (await request.json().catch(() => ({}))) as { note?: string };
  const campaign = await prisma.communicationCampaign.findUnique({
    where: { id },
  });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (!canSendForOrg(actor.role, campaign.organizationId, actor.targetOrg)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (
    !canApproveCampaign({
      approverRole: actor.role,
      approverAdminId: actor.admin.id,
      campaignCreatedByAdminId: campaign.createdByAdminId,
    })
  ) {
    return NextResponse.json({ error: "Approver is not eligible" }, { status: 403 });
  }

  await prisma.$transaction([
    prisma.communicationApproval.create({
      data: {
        campaignId: campaign.id,
        status: "REJECTED",
        approverAdminId: actor.admin.id,
        note: body.note?.trim() || null,
      },
    }),
    prisma.communicationCampaign.update({
      where: { id: campaign.id },
      data: { status: "REJECTED" },
    }),
  ]);
  return NextResponse.json({ success: true });
}
