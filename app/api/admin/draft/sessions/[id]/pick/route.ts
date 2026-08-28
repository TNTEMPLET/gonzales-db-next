import { NextRequest, NextResponse } from "next/server";
import { makeDraftPick, undoLastDraftPick } from "@/lib/draft/draftEngine";
import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import { draftApiError } from "@/lib/draft/apiError";

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
    const { playerPoolId, adminUserId } = body;

    if (!playerPoolId) {
      return NextResponse.json({ error: "Missing playerPoolId" }, { status: 400 });
    }

    const result = await makeDraftPick(id, playerPoolId, adminUserId);
    return NextResponse.json(result);
  } catch (e) {
    return draftApiError("pick.create", e, 400);
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
    const result = await undoLastDraftPick(id);
    return NextResponse.json(result);
  } catch (e) {
    return draftApiError("pick.undo", e, 400);
  }
}
