import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import { fetchGames } from "@/lib/fetchGames";
import { getAssignrLeagueId, resolveAdminTargetOrg } from "@/lib/siteConfig";

function parseSeasonYear(value: string | null) {
  if (!value) return null;
  const year = Number.parseInt(value, 10);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) return null;
  return year;
}

function sortAgeGroupLabel(a: string, b: string) {
  const numA = Number.parseInt(a, 10);
  const numB = Number.parseInt(b, 10);
  if (Number.isFinite(numA) && Number.isFinite(numB)) return numA - numB;
  if (Number.isFinite(numA)) return -1;
  if (Number.isFinite(numB)) return 1;
  return a.localeCompare(b);
}

export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "USERS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const targetOrg = resolveAdminTargetOrg(
    request.nextUrl.searchParams.get("org"),
  );
  const requestedSeasonYear = parseSeasonYear(
    request.nextUrl.searchParams.get("seasonYear"),
  );
  const seasonYear = requestedSeasonYear || new Date().getFullYear();
  const seasonStart = `${seasonYear}-01-01`;
  const seasonEnd = `${seasonYear}-12-31`;
  const leagueId = getAssignrLeagueId(targetOrg);

  try {
    const games = await fetchGames({
      startDate: seasonStart,
      endDate: seasonEnd,
      leagueId,
    });

    // Build map of ageGroup → Set<teamName>
    const teamsByAgeGroup = new Map<string, Set<string>>();

    for (const game of games) {
      const ag = typeof game.age_group === "string" && game.age_group.trim()
        ? game.age_group.trim()
        : null;
      if (!ag) continue;

      if (!teamsByAgeGroup.has(ag)) {
        teamsByAgeGroup.set(ag, new Set());
      }

      const bucket = teamsByAgeGroup.get(ag)!;
      if (game.home_team) bucket.add(game.home_team.trim());
      if (game.away_team) bucket.add(game.away_team.trim());
    }

    const ageGroups = Array.from(teamsByAgeGroup.keys()).sort(sortAgeGroupLabel);

    const teamsByAgeGroupSerialized: Record<string, string[]> = {};
    for (const ag of ageGroups) {
      teamsByAgeGroupSerialized[ag] = Array.from(
        teamsByAgeGroup.get(ag) ?? [],
      ).sort();
    }

    return NextResponse.json({
      ageGroups,
      teamsByAgeGroup: teamsByAgeGroupSerialized,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to load age groups: ${message}` },
      { status: 500 },
    );
  }
}
