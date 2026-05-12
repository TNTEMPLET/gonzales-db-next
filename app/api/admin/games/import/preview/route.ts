import { NextRequest, NextResponse } from "next/server";

import { fetchGames } from "@/lib/fetchGames";
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
import { getAssignrLeagueId, resolveAdminTargetOrg } from "@/lib/siteConfig";

export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "SCORES");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const targetOrg = resolveAdminTargetOrg(
    request.nextUrl.searchParams.get("org"),
  );
  const leagueId = getAssignrLeagueId(targetOrg);

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

    const games = await fetchGames({
      startDate: `${seasonYear}-01-01`,
      endDate: `${seasonYear}-12-31`,
      leagueId,
    });
    const catalog = buildImportCatalog(games);
    const suggestions = buildSuggestedMappings({
      drafts,
      ageGroups: catalog.ageGroups,
      venues: catalog.venues,
      venueCatalog: catalog.venueCatalog,
    });

    const previewRows = drafts.map((draft) => {
      const mapped = mapDraftToAssignrRow(
        draft,
        {
          ageGroupMappings: suggestions.ageGroupMappings,
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
      seasonYear,
      parsedCount: drafts.length,
      tournaments: collectDistinctTournaments(drafts),
      parks: collectDistinctParks(drafts),
      fields: collectDistinctFields(drafts),
      ageGroups: catalog.ageGroups,
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
