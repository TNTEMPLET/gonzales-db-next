import Link from "next/link";

import StandingsTabs from "@/components/standings/StandingsTabs";
import { fetchGames } from "@/lib/fetchGames";
import prisma from "@/lib/prisma";
import { getAssignrLeagueId, getOrgId } from "@/lib/siteConfig";
import { computeStandingsByAgeGroup } from "@/lib/standings";

export const metadata = {
  title: "Standings | Gonzales Diamond Baseball",
  description: "League standings by age group.",
};

export default async function StandingsPage() {
  const leagueId = getAssignrLeagueId();
  const orgId = getOrgId();

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

  const standings = computeStandingsByAgeGroup(
    scores.filter((score) => activeGameIds.has(score.gameExternalId)),
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

        <StandingsTabs standings={standings} />
      </section>
    </main>
  );
}
