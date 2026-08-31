import { NextRequest, NextResponse } from "next/server";

import { resolveCoachCornerActor } from "@/lib/coachCorner/auth";
import { prisma } from "@/lib/prisma";

/**
 * Coach Corner's draft list only ever shows sessions that have moved past
 * raw admin setup -- a coach has no reason to see (or be confused by) a
 * session an admin is still configuring teams/rounds for.
 */
const COACH_VISIBLE_STATUSES = ["PAIRED", "LIVE", "PAUSED", "COMPLETED", "MATERIALIZED"] as const;

export async function GET(req: NextRequest) {
  const actor = await resolveCoachCornerActor(req);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessions = await prisma.draftSession.findMany({
    where: {
      organizationId: actor.targetOrg,
      status: { in: [...COACH_VISIBLE_STATUSES] },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      ageGroup: true,
      seasonYear: true,
      status: true,
      draftType: true,
      totalRounds: true,
      scheduledStartAt: true,
      _count: { select: { playerPool: true, picks: true } },
      teams: {
        orderBy: { draftOrder: "asc" },
        select: {
          id: true,
          teamName: true,
          draftOrder: true,
          headCoachUserId: true,
          assistantUserId: true,
          headCoach: { select: { name: true } },
        },
      },
    },
  });

  const withMyTeam = sessions.map((session) => {
    const myTeam = session.teams.find(
      (team) =>
        team.headCoachUserId === actor.registeredUserId ||
        team.assistantUserId === actor.registeredUserId,
    );
    return { ...session, myTeamId: myTeam?.id ?? null, myTeamName: myTeam?.teamName ?? null };
  });

  return NextResponse.json({ sessions: withMyTeam, isAdmin: actor.isAdmin });
}
