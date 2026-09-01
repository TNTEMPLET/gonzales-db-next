import { NextRequest, NextResponse } from "next/server";
import {
  getDraftSessionState,
  makeDraftPick,
  makeDraftPickForSlot,
  resolveAutoPicks,
  skipCurrentPick,
  undoLastDraftPick,
} from "@/lib/draft/draftEngine";
import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import { draftApiError } from "@/lib/draft/apiError";
import { withTransientDbRetry } from "@/lib/prismaRetry";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await ensureAdminModule(req, "DRAFT");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const { playerPoolId, adminUserId, draftTeamId, round } = body;

    if (!playerPoolId) {
      return NextResponse.json({ error: "Missing playerPoolId" }, { status: 400 });
    }

    // draftTeamId + round present -> targeting a specific slot (drag-and-drop
    // onto an arbitrary open cell). Absent -> today's "pick for whoever's on
    // the clock" (unchanged for the existing click-to-draft flow).
    if (draftTeamId && round) {
      await withTransientDbRetry(() => makeDraftPickForSlot(id, { draftTeamId, round, playerPoolId }, adminUserId));
    } else {
      await withTransientDbRetry(() => makeDraftPick(id, playerPoolId, adminUserId));
    }
    // If the next team(s) on the clock are also protected, cascade through
    // them immediately rather than waiting for the next poll to catch up.
    await withTransientDbRetry(() => resolveAutoPicks(id));
    return NextResponse.json(await withTransientDbRetry(() => getDraftSessionState(id)));
  } catch (e) {
    return draftApiError("pick.create", e, 400);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await ensureAdminModule(req, "DRAFT");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    if (body?.action !== "skip") {
      return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }

    await withTransientDbRetry(() => skipCurrentPick(id));
    // The next slot might itself be a protected/auto-draft pick -- cascade
    // through those immediately, same as after a normal pick.
    await withTransientDbRetry(() => resolveAutoPicks(id));
    return NextResponse.json(await withTransientDbRetry(() => getDraftSessionState(id)));
  } catch (e) {
    return draftApiError("pick.skip", e, 400);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await ensureAdminModule(req, "DRAFT");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const { id } = await params;
    await withTransientDbRetry(() => undoLastDraftPick(id));
    // The rewound cursor could land back on an auto-draft-enabled team's
    // slot -- cascade through it immediately rather than leaving the draft
    // silently stalled until someone happens to act.
    await withTransientDbRetry(() => resolveAutoPicks(id));
    return NextResponse.json(await withTransientDbRetry(() => getDraftSessionState(id)));
  } catch (e) {
    return draftApiError("pick.undo", e, 400);
  }
}
