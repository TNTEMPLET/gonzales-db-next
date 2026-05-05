import { NextRequest, NextResponse } from "next/server";

import { resolveCommunicationActor } from "@/lib/communications/authz";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const actor = await resolveCommunicationActor(request);
  if (!actor.ok) return NextResponse.json({ error: actor.message }, { status: actor.status });

  const includeGlobal = request.nextUrl.searchParams.get("includeGlobal") === "1";
  const rows = await prisma.communicationCampaign.findMany({
    where: {
      status: "PENDING_APPROVAL",
      ...(includeGlobal
        ? { OR: [{ organizationId: actor.targetOrg }, { organizationId: null }] }
        : { organizationId: actor.targetOrg }),
    },
    include: {
      audienceRules: true,
      approvals: { orderBy: { createdAt: "desc" }, take: 3 },
      _count: { select: { recipientSnapshots: true } },
    },
    orderBy: { updatedAt: "asc" },
  });
  return NextResponse.json({ data: rows });
}
