import { NextRequest, NextResponse } from "next/server";

import {
  buildAgeGroupsByOrg,
  fetchAssignrGamesForScope,
  isAllSitesAssignrScope,
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

export async function GET(request: NextRequest) {
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
  const seasonYear = parseSeasonYear(
    request.nextUrl.searchParams.get("seasonYear"),
  );

  try {
    const games = await fetchAssignrGamesForScope({
      scope,
      startDate: `${seasonYear}-01-01`,
      endDate: `${seasonYear}-12-31`,
    });
    const catalog = buildImportCatalog(games);

    return NextResponse.json({
      scope,
      seasonYear,
      ageGroups: listAgeGroupsForScope(games, scope),
      ageGroupsByOrg: buildAgeGroupsByOrg(games),
      venues: catalog.venues,
      venueCatalog: catalog.venueCatalog,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to load Assignr catalog: ${message}` },
      { status: 500 },
    );
  }
}
