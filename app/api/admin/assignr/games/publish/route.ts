import { NextRequest, NextResponse } from "next/server";

import { ensureAssignrAdmin } from "@/lib/assignr/adminAuth";
import { getAssignrLeagueIdForOrg } from "@/lib/assignr/config";
import {
  createAssignrGame,
  findAssignrGameByUserDefinedId,
  mapImportRowToCreatePayload,
} from "@/lib/assignr/games";
import type { AssignrGamePublishRequest } from "@/lib/assignr/gamesImportPublish";
import { buildGameUserDefinedId } from "@/lib/assignr/idempotency";
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

  const body = (await request.json()) as AssignrGamePublishRequest;
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: "rows are required" }, { status: 400 });
  }
  if (body.organizationId && body.organizationId !== auth.organizationId) {
    return NextResponse.json({ error: "Organization mismatch" }, { status: 400 });
  }

  const job = await createAssignrSyncJob({
    organizationId: auth.organizationId,
    kind: "GAMES_PUBLISH",
    totalCount: body.rows.length,
    payload: { seasonYear: body.seasonYear, rowCount: body.rows.length },
    createdByAdminId: auth.adminUserId,
  });

  await markAssignrSyncJobRunning(job.id);

  const leagueId = getAssignrLeagueIdForOrg(auth.organizationId);
  const startDate = body.rows
    .map((row) => row.date)
    .sort((a, b) => a.localeCompare(b))[0];
  const endDate = body.rows
    .map((row) => row.date)
    .sort((a, b) => b.localeCompare(a))[0];

  const { results, successCount, failedCount } = await runAssignrJobChunks({
    items: body.rows,
    handler: async (row, index) => {
      const key = buildGameUserDefinedId(row, leagueId);
      try {
        const existing = await findAssignrGameByUserDefinedId(key, {
          startDate,
          endDate,
          leagueId,
        });
        if (existing?.id) {
          return {
            key,
            success: true,
            assignrId: String(existing.id),
            message: "Already exists",
          };
        }

        const payload = mapImportRowToCreatePayload(row, auth.organizationId);
        const created = await createAssignrGame(auth.organizationId, payload);
        await recordAssignrAuditLog({
          organizationId: auth.organizationId,
          action: "game.publish",
          assignrResource: "game",
          assignrResourceId: String(created.id),
          requestSummary: payload,
          success: true,
          adminUserId: auth.adminUserId,
          syncJobId: job.id,
        });
        return {
          key,
          success: true,
          assignrId: String(created.id),
          message: `Created row ${index + 1}`,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await recordAssignrAuditLog({
          organizationId: auth.organizationId,
          action: "game.publish",
          assignrResource: "game",
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
