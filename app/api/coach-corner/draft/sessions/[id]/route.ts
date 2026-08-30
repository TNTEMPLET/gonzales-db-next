import { NextRequest, NextResponse } from "next/server";

import { resolveCoachCornerActor } from "@/lib/coachCorner/auth";
import { getDraftSessionState, resolveAutoProtectedPicks } from "@/lib/draft/draftEngine";
import { draftApiError } from "@/lib/draft/apiError";

/**
 * Coach-facing mirror of app/api/admin/draft/sessions/[id]/route.ts's GET.
 * Same state shape (DraftSessionState), plus myTeamId so the client knows
 * which team, if any, this viewer is allowed to pick for. Read-only --
 * settings/roster-management/delete stay admin-only.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await resolveCoachCornerActor(req);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    await resolveAutoProtectedPicks(id);
    const state = await getDraftSessionState(id);

    if (state.session.organizationId !== actor.targetOrg) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!actor.isAdmin && state.session.status === "SETUP") {
      return NextResponse.json({ error: "Draft not open yet" }, { status: 403 });
    }

    const myTeam = state.session.teams.find(
      (team) =>
        team.headCoachUserId === actor.registeredUserId ||
        team.assistantUserId === actor.registeredUserId,
    );

    return NextResponse.json({ ...state, myTeamId: myTeam?.id ?? null, isAdmin: actor.isAdmin });
  } catch (e) {
    return draftApiError("coachCorner.session.get", e, 404);
  }
}
