import Link from "next/link";

import StandingsTabs from "@/components/standings/StandingsTabs";
import { fetchGames } from "@/lib/fetchGames";
import prisma from "@/lib/prisma";
import { getAssignrLeagueId, getOrgId, getSiteConfig } from "@/lib/siteConfig";
import { computeStandingsByAgeGroup } from "@/lib/standings";

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
      startDate: "2026-03-01",
      endDate: "2026-06-30",
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
      <section className="max-w-6xl mx-auto px-6 py-12 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-2">
              League Standings
            </h1>
            <p className="text-zinc-400">
              By age group with current scored results.
            </p>
          </div>
          <Link
            href="/schedule"
            className="text-sm rounded-lg border border-zinc-700 px-4 py-2 text-zinc-200 hover:bg-zinc-800"
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
