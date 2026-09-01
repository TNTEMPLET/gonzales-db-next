import { NextRequest, NextResponse } from "next/server";
import { getDraftSessionState, resolveAutoPicks, undoPickById } from "@/lib/draft/draftEngine";
import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import { draftApiError } from "@/lib/draft/apiError";
import { withTransientDbRetry } from "@/lib/prismaRetry";

/**
 * Undoes one specific pick, by id, regardless of round -- unlike DELETE on
 * .../pick (which only ever undoes the single most recent pick), this lets
 * an admin fix an earlier-round mistake without having to undo everything
 * made since. See undoPickById's doc comment for the cursor-rewind rule.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; pickId: string }> }
) {
  const auth = await ensureAdminModule(req, "DRAFT");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const { id, pickId } = await params;
    await withTransientDbRetry(() => undoPickById(id, pickId));
    // The reopened slot could itself be a protected/auto-draft pick if it's
    // at or behind the live cursor -- cascade through those immediately,
    // same as after a normal pick.
    await withTransientDbRetry(() => resolveAutoPicks(id));
    return NextResponse.json(await withTransientDbRetry(() => getDraftSessionState(id)));
  } catch (e) {
    return draftApiError("pick.undoById", e, 400);
  }
}
