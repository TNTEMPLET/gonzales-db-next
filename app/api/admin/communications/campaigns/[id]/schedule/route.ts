import { NextRequest, NextResponse } from "next/server";

import { resolveCommunicationActor } from "@/lib/communications/authz";
import { canSendForOrg } from "@/lib/communications/policy";
import prisma from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await resolveCommunicationActor(request);
  if (!actor.ok) return NextResponse.json({ error: actor.message }, { status: actor.status });
  const { id } = await params;
  const body = (await request.json()) as { sendAt?: string; timezone?: string };

  const sendAt = body.sendAt ? new Date(body.sendAt) : null;
  if (!sendAt || Number.isNaN(sendAt.getTime())) {
    return NextResponse.json({ error: "Valid sendAt is required" }, { status: 400 });
  }
  const campaign = await prisma.communicationCampaign.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (!canSendForOrg(actor.role, campaign.organizationId, actor.targetOrg)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await prisma.communicationCampaign.update({
    where: { id },
    data: {
      sendAt,
      timezone: body.timezone?.trim() || null,
      status: campaign.status === "APPROVED" ? "SCHEDULED" : campaign.status,
    },
  });
  return NextResponse.json({ success: true, data: updated });
}
