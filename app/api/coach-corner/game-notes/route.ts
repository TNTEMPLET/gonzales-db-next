import { NextRequest, NextResponse } from "next/server";

import { resolveCoachCornerActor } from "@/lib/coachCorner/auth";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const actor = await resolveCoachCornerActor(request);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    teamId?: string;
    gameExternalId?: string;
    note?: string | null;
    availabilityNote?: string | null;
  };
  if (!body.teamId || !body.gameExternalId) {
    return NextResponse.json(
      { error: "teamId and gameExternalId are required" },
      { status: 400 },
    );
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

  const saved = await prisma.teamGameNote.upsert({
    where: {
      teamId_gameExternalId: {
        teamId: team.id,
        gameExternalId: body.gameExternalId,
      },
    },
    create: {
      teamId: team.id,
      gameExternalId: body.gameExternalId,
      note: body.note?.trim() || null,
      availabilityNote: body.availabilityNote?.trim() || null,
      authoredByUserId: actor.registeredUserId,
    },
    update: {
      note: body.note?.trim() || null,
      availabilityNote: body.availabilityNote?.trim() || null,
      authoredByUserId: actor.registeredUserId,
    },
  });

  return NextResponse.json({ success: true, data: saved });
}
