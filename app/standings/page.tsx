import Link from "next/link";

import StandingsTabs from "@/components/standings/StandingsTabs";
import { getOrgId, getSiteConfig } from "@/lib/siteConfig";
import { loadSeasonStandings } from "@/lib/standings/loadSeasonStandings";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Standings | ${site.name}`,
    description: `League standings by age group for ${site.name}.`,
  };
}

export default async function StandingsPage() {
  const orgId = getOrgId();
  const season = await loadSeasonStandings(
    orgId === "ascension" ? "ascension" : orgId === "fallball" ? "fallball" : "gonzales",
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
              {season.seasonName} · by age group with current scored results.
            </p>
          </div>
          <Link
            href="/schedule"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 sm:self-auto"
          >
            View Schedule
          </Link>
        </div>

        <StandingsTabs standings={season.standings} />
      </section>
    </main>
  );
}
