import { NextRequest, NextResponse } from "next/server";

import {
  buildAgeGroupsByOrg,
  fetchAssignrGamesForScope,
  listAgeGroupsForScope,
  resolveAdminAssignrScope,
} from "@/lib/admin/assignrOrgScope";
import {
  buildImportCatalog,
  buildSuggestedMappings,
  collectDistinctFields,
  collectDistinctParks,
  collectDistinctTournaments,
  parseSeasonYear,
  serializeDraftForPreview,
} from "@/lib/assignr/gamesImportService";
import { mapDraftToAssignrRow } from "@/lib/assignr/gamesImportCsv";
import { parseTournamentScheduleBuffer } from "@/lib/assignr/tournamentScheduleParser";
import { ensureAdminModule } from "@/lib/news/auth";

export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "SCORES");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const scope = resolveAdminAssignrScope(
    request.nextUrl.searchParams.get("org"),
  );

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const seasonYear = parseSeasonYear(formData.get("seasonYear"));

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "CSV or XLSX file is required" },
        { status: 400 },
      );
    }

    const buffer = await file.arrayBuffer();
    const drafts = parseTournamentScheduleBuffer(buffer, seasonYear);
    if (drafts.length === 0) {
      return NextResponse.json(
        { error: "No tournament games were detected in the uploaded file" },
        { status: 400 },
      );
    }

    const games = await fetchAssignrGamesForScope({
      scope,
      startDate: `${seasonYear}-01-01`,
      endDate: `${seasonYear}-12-31`,
    });
    const catalog = buildImportCatalog(games);
    const ageGroups = listAgeGroupsForScope(games, scope);
    const suggestions = buildSuggestedMappings({
      drafts,
      ageGroups,
      venues: catalog.venues,
      venueCatalog: catalog.venueCatalog,
      scope,
    });

    const previewRows = drafts.map((draft) => {
      const mapped = mapDraftToAssignrRow(
        draft,
        {
          ageGroupMappings: suggestions.ageGroupMappings,
          contentOrgMappings: suggestions.contentOrgMappings,
          parkMappings: suggestions.parkMappings,
          fieldMappings: suggestions.fieldMappings,
        },
        seasonYear,
      );

      return {
        draft: serializeDraftForPreview(draft),
        preview: mapped.row,
        warnings: mapped.warnings,
        skipped: mapped.skipped,
      };
    });

    return NextResponse.json({
      scope,
      seasonYear,
      parsedCount: drafts.length,
      tournaments: collectDistinctTournaments(drafts),
      parks: collectDistinctParks(drafts),
      fields: collectDistinctFields(drafts),
      ageGroups,
      ageGroupsByOrg: buildAgeGroupsByOrg(games),
      venues: catalog.venues,
      venueCatalog: catalog.venueCatalog,
      suggestedMappings: suggestions,
      rows: previewRows,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to preview tournament import: ${message}` },
      { status: 500 },
    );
  }
}
