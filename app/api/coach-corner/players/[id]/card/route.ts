import { NextRequest, NextResponse } from "next/server";

import { resolveCoachCornerActor } from "@/lib/coachCorner/auth";
import { getPlayerCard } from "@/lib/players/service";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Coach Player Card — only for players on teams the actor can manage.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await resolveCoachCornerActor(request);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const playerId = id?.trim();
  if (!playerId) {
    return NextResponse.json({ error: "Player id is required" }, { status: 400 });
  }

  const player = await prisma.teamPlayer.findUnique({
    where: { id: playerId },
    include: {
      team: {
        select: {
          id: true,
          organizationId: true,
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

  try {
    const card = await getPlayerCard(playerId, actor.targetOrg, "COACH");
    if (!card) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }
    return NextResponse.json(
      { data: card },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load player card";
    console.error("[coach-corner/players/card GET]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
