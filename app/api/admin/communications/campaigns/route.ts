import type { CommunicationChannel } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { canSendForOrg } from "@/lib/communications/policy";
import { resolveCommunicationActor } from "@/lib/communications/authz";
import prisma from "@/lib/prisma";

type CreateCampaignBody = {
  title?: string;
  messageSubject?: string | null;
  messageBody?: string;
  channels?: CommunicationChannel[];
  organizationId?: string | null;
  quietHoursStart?: number | null;
  quietHoursEnd?: number | null;
  rules?: Array<{
    ruleType:
      | "ALL_USERS"
      | "ORGANIZATION"
      | "ALL_COACHES"
      | "ORGANIZATION_COACHES"
      | "COACHING_INTEREST"
      | "ADMIN_ROLE";
    organizationId?: string | null;
    adminRole?: "MASTER_ADMIN" | "ADMIN" | "BOARD_MEMBER" | "PARK_DIRECTOR" | null;
    coachingInterestStatus?: "NEW" | "CONTACTED" | "NOT_INTERESTED" | "CONVERTED" | "ARCHIVED" | null;
  }>;
};

export async function GET(request: NextRequest) {
  const actor = await resolveCommunicationActor(request);
  if (!actor.ok) return NextResponse.json({ error: actor.message }, { status: actor.status });

  const includeGlobal = request.nextUrl.searchParams.get("includeGlobal") === "1";
  const campaigns = await prisma.communicationCampaign.findMany({
    where: includeGlobal
      ? { OR: [{ organizationId: actor.targetOrg }, { organizationId: null }] }
      : { organizationId: actor.targetOrg },
    include: {
      audienceRules: true,
      approvals: { orderBy: { createdAt: "desc" }, take: 5 },
      _count: { select: { recipientSnapshots: true, deliveries: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ data: campaigns });
}

export async function POST(request: NextRequest) {
  const actor = await resolveCommunicationActor(request);
  if (!actor.ok) return NextResponse.json({ error: actor.message }, { status: actor.status });

  const body = (await request.json()) as CreateCampaignBody;
  const title = body.title?.trim() || "";
  const messageBody = body.messageBody?.trim() || "";
  if (!title || !messageBody) {
    return NextResponse.json({ error: "title and messageBody are required" }, { status: 400 });
  }
  const channels: CommunicationChannel[] =
    Array.isArray(body.channels) && body.channels.length > 0 ? body.channels : ["EMAIL"];
  const requestedOrg =
    body.organizationId === undefined
      ? actor.targetOrg
      : body.organizationId === null
        ? null
        : body.organizationId;
  if (!canSendForOrg(actor.role, requestedOrg, actor.targetOrg)) {
    return NextResponse.json({ error: "Forbidden for selected audience scope" }, { status: 403 });
  }

  const created = await prisma.communicationCampaign.create({
    data: {
      organizationId: requestedOrg,
      logicalMode: "AND",
      channels,
      title,
      messageSubject: body.messageSubject?.trim() || null,
      messageBody,
      quietHoursStart:
        typeof body.quietHoursStart === "number" ? Math.max(0, Math.min(23, body.quietHoursStart)) : null,
      quietHoursEnd:
        typeof body.quietHoursEnd === "number" ? Math.max(0, Math.min(23, body.quietHoursEnd)) : null,
      createdByAdminId: actor.admin.id,
      audienceRules: {
        create:
          body.rules?.map((rule) => ({
            ruleType: rule.ruleType,
            organizationId: rule.organizationId ?? null,
            adminRole: rule.adminRole ?? null,
            coachingInterestStatus: rule.coachingInterestStatus ?? null,
          })) ?? [],
      },
    },
    include: {
      audienceRules: true,
    },
  });

  return NextResponse.json({ success: true, data: created });
}
