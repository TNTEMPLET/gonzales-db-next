import { NextRequest, NextResponse } from "next/server";

import { resolveCoachCornerActor } from "@/lib/coachCorner/auth";
import { getDraftSessionState, makeDraftPick, resolveAutoProtectedPicks } from "@/lib/draft/draftEngine";
import { draftApiError } from "@/lib/draft/apiError";

/**
 * Coach-facing pick endpoint. Unlike the admin route, this enforces that the
 * caller may only pick for the team currently on the clock, and only when
 * that team is *their own* (head or assistant coach) -- an admin viewing
 * Coach Corner (e.g. via the coach-corner login path in
 * resolveCoachCornerActor) can still pick for any team, matching their
 * existing admin-desk powers. No DELETE/undo here -- that stays admin-only.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await resolveCoachCornerActor(req);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const { playerPoolId } = body;
    if (!playerPoolId) {
      return NextResponse.json({ error: "Missing playerPoolId" }, { status: 400 });
    }

    const { session, onClock } = await getDraftSessionState(id);
    if (session.organizationId !== actor.targetOrg) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (session.status !== "LIVE") {
      return NextResponse.json({ error: "Draft is not live" }, { status: 409 });
    }
    if (!onClock) {
      return NextResponse.json({ error: "No team is currently on the clock" }, { status: 409 });
    }

    if (!actor.isAdmin) {
      const onClockTeam = session.teams.find((t) => t.id === onClock.teamId);
      const isMyTeam =
        onClockTeam?.headCoachUserId === actor.registeredUserId ||
        onClockTeam?.assistantUserId === actor.registeredUserId;
      if (!isMyTeam) {
        return NextResponse.json(
          { error: `It's not your team's turn -- ${onClock.teamName} is on the clock.` },
          { status: 403 },
        );
      }
    }

    await makeDraftPick(id, playerPoolId, actor.registeredUserId);
    await resolveAutoProtectedPicks(id);

    const nextState = await getDraftSessionState(id);
    const myTeam = nextState.session.teams.find(
      (team) =>
        team.headCoachUserId === actor.registeredUserId ||
        team.assistantUserId === actor.registeredUserId,
    );
    return NextResponse.json({ ...nextState, myTeamId: myTeam?.id ?? null, isAdmin: actor.isAdmin });
  } catch (e) {
    return draftApiError("coachCorner.pick.create", e, 400);
  }
}
