import ScheduleTable from "@/components/ScheduleTable";
import { fetchGames, type Game } from "@/lib/fetchGames";
import prisma from "@/lib/prisma";
import { getAssignrLeagueId, getOrgId, getSiteConfig } from "@/lib/siteConfig";
import {
  computeStandingsByAgeGroup,
  type AgeGroupStandings,
} from "@/lib/standings";

type ViewMode = "thisWeek" | "nextWeek" | "fullSeason";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Schedule & Standings | ${site.name}`,
    description: `Full game schedule and standings for ${site.name}.`,
  };
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const viewMode = (resolvedSearchParams.view as ViewMode) || "thisWeek";
  const leagueId = getAssignrLeagueId();
  const orgId = getOrgId();

  const now = new Date();
  let startDate: string;
  let endDate: string;

  if (viewMode === "thisWeek") {
    const startOfWeek = new Date(now);
    startOfWeek.setDate(
      now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1),
    );
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    startDate = startOfWeek.toISOString().split("T")[0]!;
    endDate = endOfWeek.toISOString().split("T")[0]!;
  } else if (viewMode === "nextWeek") {
    const startOfNextWeek = new Date(now);
    startOfNextWeek.setDate(
      now.getDate() - now.getDay() + (now.getDay() === 0 ? 1 : 8),
    );
    const endOfNextWeek = new Date(startOfNextWeek);
    endOfNextWeek.setDate(startOfNextWeek.getDate() + 6);
    startDate = startOfNextWeek.toISOString().split("T")[0]!;
    endDate = endOfNextWeek.toISOString().split("T")[0]!;
  } else {
    startDate = "2026-03-01";
    endDate = "2026-06-30";
  }

  let games: Game[] = [];
  let error: string | null = null;
  let standings: AgeGroupStandings[] = [];

  try {
    games = await fetchGames({ startDate, endDate, leagueId });
  } catch (err: unknown) {
    error = err instanceof Error ? err.message : "Failed to load game data";
  }

  try {
    const [scores, allSeasonGames] = await Promise.all([
      prisma.gameScore.findMany({
        where: { organizationId: orgId },
        orderBy: [{ ageGroup: "asc" }, { gameDate: "asc" }],
        select: {
          gameExternalId: true,
          ageGroup: true,
          homeTeam: true,
          awayTeam: true,
          homeScore: true,
          awayScore: true,
        },
      }),
      fetchGames({
        startDate: "2026-03-01",
        endDate: "2026-06-30",
        leagueId,
      }),
    ]);

    const activeGameIds = new Set(
      allSeasonGames
        .filter((game) => game.status?.trim().toUpperCase() === "A")
        .map((game) => String(game.id)),
    );

    standings = computeStandingsByAgeGroup(
      scores.filter((score) => activeGameIds.has(score.gameExternalId)),
    );
  } catch {
    standings = [];
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-6xl mx-auto px-6 pt-10 pb-4">
        <h1 className="text-3xl font-bold tracking-tight mb-1">
          Schedule &amp; Standings
        </h1>
        <p className="text-zinc-400 text-sm">
          Gonzales Diamond Baseball · Spring 2026
        </p>
      </div>
      <ScheduleTable
        initialGames={games}
        initialError={error}
        currentViewMode={viewMode}
        standings={standings}
      />
    </main>
  );
}
