import { NextRequest, NextResponse } from "next/server";

import { resolveCoachCornerActor } from "@/lib/coachCorner/auth";
import prisma from "@/lib/prisma";

export async function PATCH(request: NextRequest) {
  const actor = await resolveCoachCornerActor(request);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    playerId?: string;
    rosterStatus?: string | null;
    jerseyNumber?: string | null;
  };
  if (!body.playerId) {
    return NextResponse.json({ error: "playerId is required" }, { status: 400 });
  }

  const player = await prisma.teamPlayer.findUnique({
    where: { id: body.playerId },
    include: {
      team: {
        include: {
          coachAssignments: { select: { registeredUserId: true } },
        },
      },
    },
  });
  if (!player || player.team.organizationId !== actor.targetOrg) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const canManage =
    actor.isAdmin ||
    player.team.coachAssignments.some(
      (assignment) => assignment.registeredUserId === actor.registeredUserId,
    );
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await prisma.teamPlayer.update({
    where: { id: player.id },
    data: {
      rosterStatus:
        body.rosterStatus === undefined ? undefined : body.rosterStatus?.trim() || null,
      jerseyNumber:
        body.jerseyNumber === undefined ? undefined : body.jerseyNumber?.trim() || null,
    },
  });
  return NextResponse.json({ success: true, player: updated });
}
