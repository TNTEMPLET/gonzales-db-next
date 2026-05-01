import { NextRequest, NextResponse } from "next/server";

import { resolveCoachCornerActor } from "@/lib/coachCorner/auth";
import prisma from "@/lib/prisma";

export async function PATCH(request: NextRequest) {
  const actor = await resolveCoachCornerActor(request);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    teamId?: string;
    contactNotes?: string | null;
    practicePlan?: string | null;
  };
  if (!body.teamId) {
    return NextResponse.json({ error: "teamId is required" }, { status: 400 });
  }

  const team = await prisma.team.findUnique({
    where: { id: body.teamId },
    include: {
      coachAssignments: { select: { registeredUserId: true } },
    },
  });
  if (!team || team.organizationId !== actor.targetOrg) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const canManage =
    actor.isAdmin ||
    team.coachAssignments.some(
      (assignment) => assignment.registeredUserId === actor.registeredUserId,
    );
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await prisma.team.update({
    where: { id: team.id },
    data: {
      contactNotes:
        body.contactNotes === undefined ? undefined : body.contactNotes?.trim() || null,
      practicePlan:
        body.practicePlan === undefined ? undefined : body.practicePlan?.trim() || null,
    },
  });

  return NextResponse.json({ success: true, team: updated });
}
