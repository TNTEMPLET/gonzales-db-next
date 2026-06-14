import Link from "next/link";

import StandingsTabs from "@/components/standings/StandingsTabs";
import { fetchGames } from "@/lib/fetchGames";
import prisma from "@/lib/prisma";
import { SEASON_END_DATE, SEASON_START_DATE } from "@/lib/seasonConfig";
import { getAssignrLeagueId, getOrgId, getSiteConfig } from "@/lib/siteConfig";
import { computeStandingsByAgeGroup } from "@/lib/standings";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Standings | ${site.name}`,
    description: `League standings by age group for ${site.name}.`,
  };
}

export default async function StandingsPage() {
  const leagueId = getAssignrLeagueId();
  const orgId = getOrgId();

  const scores = await prisma.gameScore.findMany({
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
  });

  let activeGameIds: Set<string> | null = null;
  let scheduleUnavailable = false;
  try {
    const allSeasonGames = await fetchGames({
      startDate: SEASON_START_DATE,
      endDate: SEASON_END_DATE,
      leagueId,
    });
    activeGameIds = new Set(
      allSeasonGames
        .filter((game) => game.status?.trim().toUpperCase() === "A")
        .map((game) => String(game.id)),
    );
  } catch {
    // Fail-soft: keep standings renderable when schedule API credentials expire.
    scheduleUnavailable = true;
  }

  const standings = computeStandingsByAgeGroup(
    activeGameIds ? scores.filter((score) => activeGameIds.has(score.gameExternalId)) : scores,
  );

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <section className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6 sm:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="mb-2 text-3xl font-bold tracking-tight md:text-5xl">
              League Standings
            </h1>
            <p className="text-zinc-400">
              By age group with current scored results.
            </p>
          </div>
          <Link
            href="/schedule"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 sm:self-auto"
          >
            View Schedule
          </Link>
        </div>

        {scheduleUnavailable ? (
          <div className="rounded-lg border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-200">
            Live schedule sync is temporarily unavailable. Showing standings from scored games only.
          </div>
        ) : null}

        <StandingsTabs standings={standings} />
      </section>
    </main>
  );
}
