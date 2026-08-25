import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";
import { undoTeamListImportBatch } from "@/lib/sportsConnect/teamListPreview";
import { undoBatch as undoPlayerImportBatch } from "@/app/api/admin/teams/import/route";
import { undoCoachImportBatch } from "@/app/api/admin/users/import/undo/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type UndoBody = {
  teamListBatchId?: string;
  playerBatchId?: string;
  coachBatchId?: string;
};

/**
 * POST /api/admin/teams/smart-build/undo
 *
 * Undoes a Smart Auto-Build run as a single action: reverses the Team
 * List, Player, and Coach batches it created together, using each kind's
 * existing undo function (same ones the legacy single-file modals already
 * use for their own "Undo" buttons) rather than a fourth rollback
 * implementation. Each batch ID is optional — pass whichever ones the build
 * actually produced (app/api/admin/teams/smart-build/confirm's response
 * carries all three batch IDs together for this reason). Reverses in the
 * opposite order writes happened (coaches, then players, then teams) so a
 * team isn't deleted out from under player/coach rows that still reference
 * it, though Team's onDelete: Cascade would clean those up regardless.
 */
export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const body = (await request.json().catch(() => ({}))) as UndoBody;

  const teamListBatchId = typeof body.teamListBatchId === "string" ? body.teamListBatchId : undefined;
  const playerBatchId = typeof body.playerBatchId === "string" ? body.playerBatchId : undefined;
  const coachBatchId = typeof body.coachBatchId === "string" ? body.coachBatchId : undefined;

  if (!teamListBatchId && !playerBatchId && !coachBatchId) {
    return NextResponse.json(
      { error: "At least one of teamListBatchId, playerBatchId, or coachBatchId is required" },
      { status: 400 },
    );
  }

  const errors: Record<string, string> = {};
  let coachUndo: Awaited<ReturnType<typeof undoCoachImportBatch>> | null = null;
  let playerUndo: Awaited<ReturnType<typeof undoPlayerImportBatch>> | null = null;
  let teamListUndo: Awaited<ReturnType<typeof undoTeamListImportBatch>> | null = null;

  if (coachBatchId) {
    try {
      coachUndo = await undoCoachImportBatch(targetOrg, coachBatchId);
    } catch (err) {
      errors.coach = err instanceof Error ? err.message : "Failed to undo coach import";
    }
  }

  if (playerBatchId) {
    try {
      playerUndo = await undoPlayerImportBatch(targetOrg, playerBatchId);
    } catch (err) {
      errors.player = err instanceof Error ? err.message : "Failed to undo player import";
    }
  }

  if (teamListBatchId) {
    try {
      teamListUndo = await undoTeamListImportBatch(targetOrg, teamListBatchId);
    } catch (err) {
      errors.teamList = err instanceof Error ? err.message : "Failed to undo team list import";
    }
  }

  const hasAnySuccess = !!(coachUndo || playerUndo || teamListUndo);
  const status = Object.keys(errors).length > 0 ? (hasAnySuccess ? 207 : 400) : 200;

  return NextResponse.json(
    {
      success: status === 200,
      data: { coach: coachUndo, player: playerUndo, teamList: teamListUndo },
      errors: Object.keys(errors).length > 0 ? errors : undefined,
    },
    { status },
  );
}
