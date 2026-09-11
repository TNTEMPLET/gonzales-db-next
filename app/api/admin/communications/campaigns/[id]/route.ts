import type { CommunicationChannel } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import {
  parseCampaignRuleBody,
  toAudienceRuleWrite,
  validateCampaignRules,
  type CampaignRuleBody,
} from "@/lib/communications/campaignRuleWrite";
import { logicalModeForRules } from "@/lib/communications/divisionAudience";
import { resolveCommunicationActor } from "@/lib/communications/authz";
import { resolveFromAddress } from "@/lib/communications/fromAddresses";
import { canDeleteCampaign, canSendForOrg } from "@/lib/communications/policy";
import prisma from "@/lib/prisma";

type UpdateCampaignBody = {
  title?: string;
  messageSubject?: string | null;
  messageBody?: string;
  fromEmail?: string | null;
  channels?: CommunicationChannel[];
  organizationId?: string | null;
  quietHoursStart?: number | null;
  quietHoursEnd?: number | null;
  rules?: CampaignRuleBody[];
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await resolveCommunicationActor(request);
  if (!actor.ok) return NextResponse.json({ error: actor.message }, { status: actor.status });
  const { id } = await params;
  const campaign = await prisma.communicationCampaign.findUnique({
    where: { id },
    include: {
      audienceRules: true,
      approvals: { orderBy: { createdAt: "desc" } },
      recipientSnapshots: true,
      deliveries: { orderBy: { createdAt: "desc" }, take: 500 },
    },
  });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (!canSendForOrg(actor.role, campaign.organizationId, actor.targetOrg)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ data: campaign });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await resolveCommunicationActor(request);
  if (!actor.ok) return NextResponse.json({ error: actor.message }, { status: actor.status });
  const { id } = await params;
  const body = (await request.json()) as UpdateCampaignBody;

  const existing = await prisma.communicationCampaign.findUnique({
    where: { id },
  });
  if (!existing) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (!canSendForOrg(actor.role, existing.organizationId, actor.targetOrg)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (existing.status !== "DRAFT" && existing.status !== "REJECTED") {
    return NextResponse.json({ error: "Only drafts/rejected campaigns can be edited" }, { status: 409 });
  }

  const requestedOrg =
    body.organizationId === undefined
      ? existing.organizationId
      : body.organizationId === null
        ? null
        : body.organizationId;
  if (!canSendForOrg(actor.role, requestedOrg, actor.targetOrg)) {
    return NextResponse.json({ error: "Forbidden for selected audience scope" }, { status: 403 });
  }

  let fromEmail = existing.fromEmail;
  if (body.fromEmail !== undefined) {
    try {
      fromEmail = await resolveFromAddress(body.fromEmail);
    } catch (err: unknown) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Invalid from address" },
        { status: 400 },
      );
    }
  }

  const parsedRules = body.rules ? body.rules.map(parseCampaignRuleBody) : null;
  if (parsedRules) {
    const ruleError = validateCampaignRules(parsedRules);
    if (ruleError) {
      return NextResponse.json({ error: ruleError }, { status: 400 });
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const campaign = await tx.communicationCampaign.update({
      where: { id },
      data: {
        title: body.title?.trim() || existing.title,
        messageSubject: body.messageSubject === undefined ? existing.messageSubject : body.messageSubject?.trim() || null,
        messageBody: body.messageBody?.trim() || existing.messageBody,
        fromEmail,
        channels: body.channels && body.channels.length > 0 ? body.channels : existing.channels,
        logicalMode: parsedRules ? logicalModeForRules(parsedRules) : existing.logicalMode,
        organizationId: requestedOrg,
        quietHoursStart:
          typeof body.quietHoursStart === "number"
            ? Math.max(0, Math.min(23, body.quietHoursStart))
            : body.quietHoursStart === null
              ? null
              : existing.quietHoursStart,
        quietHoursEnd:
          typeof body.quietHoursEnd === "number"
            ? Math.max(0, Math.min(23, body.quietHoursEnd))
            : body.quietHoursEnd === null
              ? null
              : existing.quietHoursEnd,
        status: "DRAFT",
      },
    });

    if (parsedRules) {
      await tx.communicationAudienceRule.deleteMany({ where: { campaignId: campaign.id } });
      if (parsedRules.length > 0) {
        await tx.communicationAudienceRule.createMany({
          data: parsedRules.map((rule) => ({
            campaignId: campaign.id,
            ...toAudienceRuleWrite(rule),
          })),
        });
      }
    }

    return tx.communicationCampaign.findUnique({
      where: { id: campaign.id },
      include: { audienceRules: true },
    });
  });

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await resolveCommunicationActor(request);
  if (!actor.ok) return NextResponse.json({ error: actor.message }, { status: actor.status });
  const { id } = await params;
  const existing = await prisma.communicationCampaign.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (!canSendForOrg(actor.role, existing.organizationId, actor.targetOrg)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!canDeleteCampaign(existing.status)) {
    return NextResponse.json(
      {
        error:
          existing.status === "SCHEDULED"
            ? "Cancel the schedule before deleting this campaign"
            : "Sent or in-flight campaigns cannot be deleted",
      },
      { status: 409 },
    );
  }
  await prisma.communicationCampaign.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
