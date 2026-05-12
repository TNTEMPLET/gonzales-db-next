import { NextRequest, NextResponse } from "next/server";

import { fetchGames } from "@/lib/fetchGames";
import {
  buildImportCatalog,
  parseSeasonYear,
} from "@/lib/assignr/gamesImportService";
import { ensureAdminModule } from "@/lib/news/auth";
import { getAssignrLeagueId, resolveAdminTargetOrg } from "@/lib/siteConfig";

export async function GET(request: NextRequest) {
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
  const seasonYear = parseSeasonYear(
    request.nextUrl.searchParams.get("seasonYear"),
  );
  const leagueId = getAssignrLeagueId(targetOrg);

  try {
    const games = await fetchGames({
      startDate: `${seasonYear}-01-01`,
      endDate: `${seasonYear}-12-31`,
      leagueId,
    });
    const catalog = buildImportCatalog(games);

    return NextResponse.json({
      seasonYear,
      ageGroups: catalog.ageGroups,
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
