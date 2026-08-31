import { NextRequest, NextResponse } from "next/server";

import { parseSeasonYear } from "@/lib/allStar/server";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";
import { downloadDriveFileBuffer } from "@/lib/sportsConnect/driveSync";
import { markCoachingInterestConverted } from "@/lib/sportsConnect/fallballCapacity";
import { parseSportsConnectExportBuffer, SPORTS_CONNECT_INGEST_MAX_ROWS } from "@/lib/sportsConnect/parseExportBuffer";
import { runTeamListImport } from "@/lib/sportsConnect/teamListPreview";
import { matchStandardDivision } from "@/lib/sportsConnect/fallballDivisions";
import { applyDraftPoolRows } from "@/lib/draft/draftPoolImport";
import {
  applyImportRows,
  emptyUndoPayload as emptyPlayerUndoPayload,
  getRowValue,
  PLAYER_IMPORT_DIVISION_KEYS,
  type Row,
  type UndoSnapshot,
} from "@/app/api/admin/teams/import/route";
import {
  applyCoachImportRows,
  emptyUndoPayload as emptyCoachUndoPayload,
  getRowValue as getCoachRowValue,
  type CsvRow,
} from "@/app/api/admin/users/import/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SourceInput = { buffer: Buffer; fileName: string } | null;

async function resolveSource(
  formData: FormData | null,
  jsonBody: Record<string, unknown> | null,
  fileKey: string,
  driveFileIdKey: string,
): Promise<SourceInput> {
  const file = formData?.get(fileKey);
  if (file instanceof File) {
    return { buffer: Buffer.from(await file.arrayBuffer()), fileName: file.name };
  }
  const driveFileId =
    (formData?.get(driveFileIdKey) as string | null) ??
    (typeof jsonBody?.[driveFileIdKey] === "string" ? (jsonBody[driveFileIdKey] as string) : null);
  if (driveFileId?.trim()) {
    const buffer = await downloadDriveFileBuffer(driveFileId.trim());
    if (!buffer) return null;
    return { buffer, fileName: `drive:${driveFileId.trim()}` };
  }
  return null;
}

/**
 * POST /api/admin/teams/smart-build/confirm
 *
 * Stage 3 of the Smart Auto-Build wizard: "1-Click Build & Assign". Runs the
 * writes in dependency order — Team List (teams must exist before players/
 * coaches can attach to them) -> Player Registration -> Coach/Volunteer ->
 * CoachingInterestSubmission conversion — writing one TeamListImportBatch,
 * TeamPlayerImportBatch, and CoachImportBatch so the whole build shares the
 * same undo coverage as the existing single-file import modals (see
 * app/api/admin/teams/smart-build/undo). Each stage reuses the exact
 * apply-row functions the legacy single-file routes already use
 * (applyImportRows, applyCoachImportRows, runTeamListImport) rather than a
 * second implementation of the same writes.
 */
export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const admin = await getAdminUserFromRequest(request);
  const contentType = request.headers.get("content-type") || "";

  let formData: FormData | null = null;
  let jsonBody: Record<string, unknown> | null = null;
  if (contentType.includes("multipart/form-data")) {
    formData = await request.formData();
  } else {
    jsonBody = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  }

  const seasonYearRaw =
    (formData?.get("seasonYear") as string | null) ??
    (typeof jsonBody?.seasonYear === "string" || typeof jsonBody?.seasonYear === "number"
      ? String(jsonBody.seasonYear)
      : "");
  const seasonYear = parseSeasonYear(seasonYearRaw);
  if (!seasonYear) {
    return NextResponse.json({ error: "seasonYear is required" }, { status: 400 });
  }

  // Age groups whose Player Registration rows should seed a DraftPlayerPool
  // (Roster build method: DRAFT) instead of writing straight to TeamPlayer
  // (the default, DIRECT_IMPORT) — plan-teams-smart-auto-build.md Stage 1's
  // per-age-group seam. The wizard's checkboxes are keyed by the preview's
  // (standardized, for fallball) ageGroup values, so this set holds those
  // same standardized strings, lowercased — matched below against each
  // row's own standardized ageGroup, not its raw division text.
  const draftAgeGroupsRaw =
    (formData?.get("draftAgeGroups") as string | null) ??
    (typeof jsonBody?.draftAgeGroups === "string" ? (jsonBody.draftAgeGroups as string) : null);
  let draftAgeGroups: Set<string> = new Set();
  if (draftAgeGroupsRaw) {
    try {
      const parsed = JSON.parse(draftAgeGroupsRaw);
      if (Array.isArray(parsed)) {
        draftAgeGroups = new Set(
          parsed.filter((v): v is string => typeof v === "string").map((v) => v.trim().toLowerCase()),
        );
      }
    } catch {
      // ignore malformed input — falls back to DIRECT_IMPORT for every age group
    }
  } else if (Array.isArray(jsonBody?.draftAgeGroups)) {
    draftAgeGroups = new Set(
      (jsonBody.draftAgeGroups as unknown[])
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim().toLowerCase()),
    );
  }

  const [teamListSource, playerRegSource, coachVolSource] = await Promise.all([
    resolveSource(formData, jsonBody, "teamList", "teamListDriveFileId"),
    resolveSource(formData, jsonBody, "playerReg", "playerRegDriveFileId"),
    resolveSource(formData, jsonBody, "coachVol", "coachVolDriveFileId"),
  ]);

  if (!teamListSource && !playerRegSource && !coachVolSource) {
    return NextResponse.json(
      { error: "At least one of teamList, playerReg, or coachVol is required" },
      { status: 400 },
    );
  }

  const adminId = admin?.id || null;
  const adminEmail = admin?.email || null;

  // 1) Teams — must run first so player/coach rows have a team to attach to.
  let teamListResult: Awaited<ReturnType<typeof runTeamListImport>> | null = null;
  if (teamListSource) {
    teamListResult = await runTeamListImport({
      targetOrg,
      seasonYear,
      source: { kind: "buffer", buffer: teamListSource.buffer, fileName: teamListSource.fileName },
      adminId,
      adminEmail,
    });
    if (teamListResult.summary.errors > 0) {
      return NextResponse.json(
        {
          error: "Fix Team List row errors before building.",
          teamList: teamListResult,
        },
        { status: 400 },
      );
    }
  }

  // 2) Players — split by each row's age group into DIRECT_IMPORT (writes
  // TeamPlayer, as before) vs DRAFT (writes DraftPlayerPool via
  // applyDraftPoolRows). Both share one TeamPlayerImportBatch/undo unit
  // since they're one logical import of one file.
  let playerResult: {
    batchId: string;
    processed: number;
    createdTeams: number;
    createdPlayers: number;
    updatedPlayers: number;
    skipped: number;
  } | null = null;
  let draftPoolResult: {
    processed: number;
    createdSessions: number;
    createdEntries: number;
    updatedEntries: number;
    skipped: number;
    sessionIdsByAgeGroup: Record<string, string>;
  } | null = null;
  if (playerRegSource) {
    const parsed = parseSportsConnectExportBuffer({
      buffer: playerRegSource.buffer,
      fileName: playerRegSource.fileName,
      sampleRows: SPORTS_CONNECT_INGEST_MAX_ROWS,
    });
    const allRows = parsed.rows as Row[];
    const directRows: Row[] = [];
    const draftPoolRows: Row[] = [];
    for (const row of allRows) {
      const rawAgeGroup = getRowValue(row, PLAYER_IMPORT_DIVISION_KEYS) || "";
      const ageGroup = (targetOrg === "fallball" ? matchStandardDivision(rawAgeGroup) : null) || rawAgeGroup;
      if (draftAgeGroups.has(ageGroup.trim().toLowerCase())) {
        draftPoolRows.push(row);
      } else {
        directRows.push(row);
      }
    }

    const draftPoolApplied =
      draftPoolRows.length > 0
        ? await applyDraftPoolRows({ rows: draftPoolRows, targetOrg, seasonYear, adminId })
        : null;
    if (draftPoolApplied) {
      draftPoolResult = {
        processed: draftPoolApplied.processed,
        createdSessions: draftPoolApplied.createdSessions,
        createdEntries: draftPoolApplied.createdEntries,
        updatedEntries: draftPoolApplied.updatedEntries,
        skipped: draftPoolApplied.skipped,
        sessionIdsByAgeGroup: draftPoolApplied.sessionIdsByAgeGroup,
      };
    }

    const initialUndoPayload: UndoSnapshot = {
      ...emptyPlayerUndoPayload(),
      createdDraftPoolEntryIds: draftPoolApplied?.createdEntryIds ?? [],
      createdDraftSessionIds: draftPoolApplied?.createdSessionIds ?? [],
    };
    const playerBatch = await prisma.teamPlayerImportBatch.create({
      data: {
        organizationId: targetOrg,
        createdByAdminId: adminId,
        status: "RUNNING",
        totalRows: allRows.length,
        undoPayload: JSON.parse(JSON.stringify(initialUndoPayload)),
      },
    });
    const applied = await applyImportRows({
      rows: directRows,
      targetOrg,
      adminId,
      explicitSeasonYear: seasonYear,
      divisionMappings: new Map(),
      batchId: playerBatch.id,
    });
    await prisma.teamPlayerImportBatch.update({
      where: { id: playerBatch.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    playerResult = {
      batchId: playerBatch.id,
      processed: applied.batch.processedRows,
      createdTeams: applied.batch.createdTeams,
      createdPlayers: applied.batch.createdPlayers,
      updatedPlayers: applied.batch.updatedPlayers,
      skipped: applied.batch.skippedRows,
    };
  }

  // 3) Coaches
  let coachResult: {
    batchId: string;
    processed: number;
    created: number;
    updated: number;
    skipped: number;
    autoAssigned: number;
    preservedCoachAssignments: number;
  } | null = null;
  let coachEmails: string[] = [];
  if (coachVolSource) {
    const parsed = parseSportsConnectExportBuffer({
      buffer: coachVolSource.buffer,
      fileName: coachVolSource.fileName,
      sampleRows: SPORTS_CONNECT_INGEST_MAX_ROWS,
    });
    const coachRows = parsed.rows as CsvRow[];
    coachEmails = coachRows
      .map((row) => getCoachRowValue(row, ["email", "Email", "EMAIL", "Volunteer Email Address"]))
      .filter((email): email is string => !!email);

    const coachBatch = await prisma.coachImportBatch.create({
      data: {
        organizationId: targetOrg,
        createdByAdminId: adminId,
        createdByEmail: adminEmail,
        undoPayload: emptyCoachUndoPayload(),
      },
      select: { id: true },
    });
    const applied = await applyCoachImportRows({
      rows: coachRows,
      targetOrg,
      batchId: coachBatch.id,
      ageGroupMappings: new Map(),
      autoAssignToTeams: true,
    });
    coachResult = {
      batchId: coachBatch.id,
      processed: applied.processed,
      created: applied.created,
      updated: applied.updated,
      skipped: applied.skipped,
      autoAssigned: applied.autoAssigned,
      preservedCoachAssignments: applied.preservedCoachAssignments,
    };
  }

  // 4) Convert matching CoachingInterestSubmission rows — bookkeeping only,
  // never blended back into any count. markCoachingInterestConverted is
  // idempotent (only touches NEW/CONTACTED rows), so it's safe to call with
  // every coach email this build touched, not just newly-created ones.
  const convertedInterestCount =
    coachEmails.length > 0 ? await markCoachingInterestConverted(targetOrg, coachEmails) : 0;

  return NextResponse.json({
    data: {
      organizationId: targetOrg,
      seasonYear,
      teamList: teamListResult
        ? {
            batchId: teamListResult.batchId,
            summary: teamListResult.summary,
          }
        : null,
      playerReg: playerResult,
      draftPool: draftPoolResult,
      coachVol: coachResult,
      convertedInterestCount,
    },
  });
}
