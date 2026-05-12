import { NextRequest, NextResponse } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import {
  fetchAssignrGamesForScope,
  resolveAdminAssignrScope,
} from "@/lib/admin/assignrOrgScope";
import {
  applyScoresImport,
  listAssignrCancelledGamesForUpload,
  parseScoresImportBuffer,
  parseScoresImportRow,
  SCORES_IMPORT_SEASON_END,
  SCORES_IMPORT_SEASON_START,
} from "@/lib/admin/scoresImportService";
import { parseJsonRecord } from "@/lib/assignr/gamesImportService";
import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const scope = resolveAdminAssignrScope(
    request.nextUrl.searchParams.get("org"),
  );
  const auth = await ensureAdminModule(request, "SCORES");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const admin = await getAdminUserFromRequest(request);

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "CSV file is required" },
        { status: 400 },
      );
    }

    const rows = parseScoresImportBuffer(Buffer.from(await file.arrayBuffer()));
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Uploaded file has no rows" },
        { status: 400 },
      );
    }

    const parkMappings = parseJsonRecord(formData.get("parkMappings"));
    const fieldMappings = parseJsonRecord(formData.get("fieldMappings"));
    const ageGroupMappings = parseJsonRecord(formData.get("ageGroupMappings"));
    const rowMappings = parseJsonRecord(formData.get("rowMappings"));
    const mappings =
      Object.keys(parkMappings).length > 0 ||
      Object.keys(fieldMappings).length > 0 ||
      Object.keys(ageGroupMappings).length > 0 ||
      Object.keys(rowMappings).length > 0
        ? { parkMappings, fieldMappings, ageGroupMappings, rowMappings }
        : undefined;
    const acknowledgeCancelledGames =
      String(formData.get("acknowledgeCancelledGames") || "")
        .trim()
        .toLowerCase() === "true";

    const games = await fetchAssignrGamesForScope({
      startDate: SCORES_IMPORT_SEASON_START,
      endDate: SCORES_IMPORT_SEASON_END,
      scope,
    });
    const parsedRows = rows.map((row, index) =>
      parseScoresImportRow(row, index + 2),
    );
    const assignrCancelledGames = listAssignrCancelledGamesForUpload(
      games,
      parsedRows,
    );
    if (assignrCancelledGames.length > 0 && !acknowledgeCancelledGames) {
      return NextResponse.json(
        { error: "Confirm Assignr cancelled games before importing." },
        { status: 400 },
      );
    }

    const summary = await applyScoresImport({
      rows,
      games,
      mappings,
      saveRow: async (payload) => {
        const gameExternalId = String(payload.game.id || "").trim();
        await prisma.gameScore.upsert({
          where: {
            organizationId_gameExternalId: {
              organizationId: payload.targetOrg,
              gameExternalId,
            },
          },
          create: {
            organizationId: payload.targetOrg,
            gameExternalId,
            ageGroup:
              (payload.game.age_group || payload.row.group || "Unassigned").trim() ||
              null,
            homeTeam: (
              payload.game.home_team ||
              payload.row.homeTeam ||
              "Home Team"
            ).trim(),
            awayTeam: (
              payload.game.away_team ||
              payload.row.awayTeam ||
              "Away Team"
            ).trim(),
            gameDate: payload.gameDate,
            homeScore: payload.homeScore,
            awayScore: payload.awayScore,
            enteredByAdminId: admin?.id || null,
          },
          update: {
            ageGroup:
              (payload.game.age_group || payload.row.group || "Unassigned").trim() ||
              null,
            homeTeam: (
              payload.game.home_team ||
              payload.row.homeTeam ||
              "Home Team"
            ).trim(),
            awayTeam: (
              payload.game.away_team ||
              payload.row.awayTeam ||
              "Away Team"
            ).trim(),
            gameDate: payload.gameDate,
            homeScore: payload.homeScore,
            awayScore: payload.awayScore,
            enteredByAdminId: admin?.id || null,
          },
        });
      },
    });

    return NextResponse.json({
      success: true,
      ...summary,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to import scores: ${message}` },
      { status: 500 },
    );
  }
}
