import { NextRequest, NextResponse } from "next/server";

import { resolveCoachCornerActor } from "@/lib/coachCorner/auth";
import { prisma } from "@/lib/prisma";

/**
 * Coach Corner's draft list only ever shows sessions that have moved past
 * raw admin setup -- a coach has no reason to see (or be confused by) a
 * session an admin is still configuring teams/rounds for. The one
 * exception: once an admin sets a scheduled start time (the "Schedule &
 * Invite" flow), that's a deliberate signal the draft has been announced,
 * so it's shown regardless of status -- otherwise a scheduled-but-still-
 * SETUP draft an admin already emailed coaches about wouldn't even appear
 * on the page the invite links to.
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
      OR: [{ status: { in: [...COACH_VISIBLE_STATUSES] } }, { scheduledStartAt: { not: null } }],
    },
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

  // LIVE first, then paused, then upcoming (soonest-scheduled first), then
  // wrapped-up drafts last -- plain alphabetical status order put
  // COMPLETED before LIVE, which is backwards for what a coach cares about.
  const statusPriority: Record<string, number> = {
    LIVE: 0,
    PAUSED: 1,
    SETUP: 2,
    PAIRED: 2,
    COMPLETED: 3,
    MATERIALIZED: 4,
  };
  withMyTeam.sort((a, b) => {
    const priorityDiff = (statusPriority[a.status] ?? 5) - (statusPriority[b.status] ?? 5);
    if (priorityDiff !== 0) return priorityDiff;
    if (a.scheduledStartAt && b.scheduledStartAt) {
      return a.scheduledStartAt.getTime() - b.scheduledStartAt.getTime();
    }
    if (a.scheduledStartAt) return -1;
    if (b.scheduledStartAt) return 1;
    return 0;
  });

  return NextResponse.json({ sessions: withMyTeam, isAdmin: actor.isAdmin });
}
