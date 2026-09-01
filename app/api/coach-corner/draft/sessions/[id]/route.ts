import { NextRequest, NextResponse } from "next/server";

import { resolveCoachCornerActor } from "@/lib/coachCorner/auth";
import { getDraftSessionState } from "@/lib/draft/draftEngine";
import { draftApiError } from "@/lib/draft/apiError";
import { withTransientDbRetry } from "@/lib/prismaRetry";

/**
 * Coach-facing mirror of app/api/admin/draft/sessions/[id]/route.ts's GET.
 * Same state shape (DraftSessionState), plus myTeamId so the client knows
 * which team, if any, this viewer is allowed to pick for. Read-only --
 * settings/roster-management/delete stay admin-only.
 *
 * Deliberately does NOT call resolveAutoPicks -- this route is polled every
 * few seconds by every open coach tab, and running an extra read-modify-write
 * pass on every single poll (instead of only right after a pick/skip/status
 * change actually happens) was a meaningful, unnecessary source of load on
 * live draft night. Every mutation that can leave an auto-resolvable pick
 * pending already triggers resolveAutoPicks itself.
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
    const state = await withTransientDbRetry(() => getDraftSessionState(id));

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
