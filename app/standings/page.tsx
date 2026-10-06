import { PublicStandingsSection } from "@/components/publicSeason/PublicSeasonSurfaces";
import StandingsTabs from "@/components/standings/StandingsTabs";
import {
  resolveCompletedPublicSeason,
  resolvePublicStandingsLabel,
} from "@/lib/publicSeason/completedSeason";
import {
  isSpringContentOrg,
  isSpringPublicOffSeason,
  springPublicPhase,
} from "@/lib/publicSeason/offSeason";
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
  const preSeason = isSpringContentOrg(siteOrg) && springPublicPhase(siteOrg) === "before";

  if (preSeason) {
    const completed = await resolveCompletedPublicSeason(siteOrg);
    const season =
      completed?.year != null
        ? await loadSeasonStandings(siteOrg, {
            seasonYear: completed.year,
            seasonName: completed.label,
          })
        : null;
    const rowsMatch = Boolean(
      completed &&
        season &&
        season.seasonName.trim() === completed.label.trim(),
    );
    return (
      <main className="min-h-screen bg-zinc-950 text-white">
        <section className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6 sm:py-12">
          <PublicStandingsSection
            org={siteOrg}
            seasonName={rowsMatch && season ? season.seasonName : ""}
            standingsLabel={rowsMatch && completed ? `${completed.label} Final Standings` : null}
          >
            {rowsMatch && season ? <StandingsTabs standings={season.standings} /> : null}
          </PublicStandingsSection>
        </section>
      </main>
    );
  }

  const [season, standingsLabel] = await Promise.all([
    loadSeasonStandings(standingsOrg),
    isSpringContentOrg(siteOrg) && isSpringPublicOffSeason(siteOrg)
      ? resolvePublicStandingsLabel(siteOrg)
      : Promise.resolve(undefined),
  ]);

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <section className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6 sm:py-12">
        <PublicStandingsSection
          org={siteOrg}
          seasonName={season.seasonName}
          standingsLabel={standingsLabel}
        >
          <StandingsTabs standings={season.standings} />
        </PublicStandingsSection>
      </section>
    </main>
  );
}
