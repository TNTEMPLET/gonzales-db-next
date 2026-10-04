import { PublicStandingsSection } from "@/components/publicSeason/PublicSeasonSurfaces";
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
  const siteOrg = getOrgId();
  const standingsOrg =
    siteOrg === "ascension" ? "ascension" : siteOrg === "fallball" ? "fallball" : "gonzales";
  const season = await loadSeasonStandings(standingsOrg);

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <section className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6 sm:py-12">
        <PublicStandingsSection org={siteOrg} seasonName={season.seasonName}>
          <StandingsTabs standings={season.standings} />
        </PublicStandingsSection>
      </section>
    </main>
  );
}
