import { NextRequest, NextResponse } from "next/server";

import { ensureAssignrAdmin } from "@/lib/assignr/adminAuth";
import { getAssignrGame, updateAssignrGame } from "@/lib/assignr/games";
import type { AssignrGameBulkUpdateRequest } from "@/lib/assignr/gamesImportPublish";
import { revalidateAssignrGamesCache } from "@/lib/assignr/invalidation";
import {
  completeAssignrSyncJob,
  createAssignrSyncJob,
  markAssignrSyncJobRunning,
  recordAssignrAuditLog,
  runAssignrJobChunks,
} from "@/lib/assignr/jobs";

export async function POST(request: NextRequest) {
  const auth = await ensureAssignrAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const body = (await request.json()) as AssignrGameBulkUpdateRequest;
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: "rows are required" }, { status: 400 });
  }
  if (body.organizationId && body.organizationId !== auth.organizationId) {
    return NextResponse.json({ error: "Organization mismatch" }, { status: 400 });
  }

  const job = await createAssignrSyncJob({
    organizationId: auth.organizationId,
    kind: "GAMES_BULK_UPDATE",
    totalCount: body.rows.length,
    payload: { rowCount: body.rows.length },
    createdByAdminId: auth.adminUserId,
  });
  await markAssignrSyncJobRunning(job.id);

  const { results, successCount, failedCount } = await runAssignrJobChunks({
    items: body.rows,
    handler: async (row) => {
      const key = row.gameId;
      try {
        const current = await getAssignrGame(row.gameId);
        const updated = await updateAssignrGame(row.gameId, {
          localized_date: row.localized_date,
          localized_time: row.localized_time,
          venue_name: row.venue_name,
          subvenue: row.subvenue,
          home_team_name: row.home_team_name,
          away_team_name: row.away_team_name,
          age_group_name: row.age_group_name,
          status: row.status,
          is_public: row.is_public,
          public_note_text: row.public_note_text,
          lock_version: current.lock_version,
        });
        await recordAssignrAuditLog({
          organizationId: auth.organizationId,
          action: "game.bulk_update",
          assignrResource: "game",
          assignrResourceId: row.gameId,
          requestSummary: row,
          responseSummary: { id: updated.id },
          success: true,
          adminUserId: auth.adminUserId,
          syncJobId: job.id,
        });
        return { key, success: true, assignrId: String(updated.id) };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await recordAssignrAuditLog({
          organizationId: auth.organizationId,
          action: "game.bulk_update",
          assignrResource: "game",
          assignrResourceId: row.gameId,
          requestSummary: row,
          success: false,
          errorMessage: message,
          adminUserId: auth.adminUserId,
          syncJobId: job.id,
        });
        return { key, success: false, message };
      }
    },
  });

  const completed = await completeAssignrSyncJob({
    jobId: job.id,
    successCount,
    failedCount,
    results,
  });

  if (successCount > 0) {
    revalidateAssignrGamesCache();
  }

  return NextResponse.json({
    data: {
      job: completed,
      successCount,
      failedCount,
      results,
    },
  });
}
