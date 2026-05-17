import TournamentBracketView from "@/components/brackets/TournamentBracketView";
import prisma from "@/lib/prisma";
import { buildBracketLayout, type BracketLayout } from "@/lib/tournament-brackets/bracketLayout";
import { safeParseBracketSpec, type BracketParkInfo } from "@/lib/tournament-brackets/bracketSpec";
import { resolveBracketThemeColors, type BracketThemeColors } from "@/lib/tournament-brackets/bracketTheme";
import {
  getContentOrgBrandColors,
  getDefaultContentOrg,
  getOrgDisplayName,
  getSiteConfig,
  getTournamentBracketBrandingForOrg,
} from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

type PublishedBracket = {
  id: string;
  name: string;
  seasonYear: number;
  updatedAt: Date;
  layout: BracketLayout;
  parkInfo?: BracketParkInfo | null;
  themeColors: BracketThemeColors;
};

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Tournaments | ${site.name}`,
    description: `Published tournament brackets for ${site.name}.`,
  };
}

export default async function TournamentsPage() {
  const site = getSiteConfig();
  const org = getDefaultContentOrg();
  const branding = getTournamentBracketBrandingForOrg(org);
  const siteThemeDefaults = getContentOrgBrandColors(org);

  const projects = await prisma.bracketProject.findMany({
    where: {
      organizationId: org,
      status: "READY",
    },
    orderBy: [{ seasonYear: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      seasonYear: true,
      updatedAt: true,
      spec: true,
    },
  });

  const brackets: PublishedBracket[] = projects.flatMap((project) => {
    const parsed = safeParseBracketSpec(project.spec);
    if (!parsed.ok) {
      console.warn(`[bracket-spec] public tournaments ${project.id}: ${parsed.issues}`);
      return [];
    }

    try {
      return [
        {
          id: project.id,
          name: project.name,
          seasonYear: project.seasonYear,
          updatedAt: project.updatedAt,
          layout: buildBracketLayout(parsed.spec),
          parkInfo: parsed.spec.parkInfo,
          themeColors: resolveBracketThemeColors(parsed.spec, siteThemeDefaults),
        },
      ];
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[bracket-layout] public tournaments ${project.id}: ${message}`);
      return [];
    }
  });

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8 sm:mb-10">
          <div className="inline-block rounded-full bg-brand-purple px-4 py-2 text-[11px] tracking-[2px] sm:px-6 sm:text-xs sm:tracking-[3px]">
            TOURNAMENTS
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-5xl">Tournament Brackets</h1>
          <p className="mt-3 max-w-2xl text-sm text-zinc-400">
            Published brackets for {getOrgDisplayName(org)} tournaments. Check back here for updates as games are
            completed.
          </p>
        </div>

        {brackets.length > 0 ? (
          <div className="space-y-8">
            {brackets.map((bracket) => (
              <article key={bracket.id} className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3 sm:p-5">
                <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-zinc-100">{bracket.name}</h2>
                    <p className="text-xs uppercase tracking-wide text-zinc-500">
                      {bracket.seasonYear} · Updated {bracket.updatedAt.toLocaleDateString("en-US")}
                    </p>
                  </div>
                </div>
                <div className="relative mt-2 w-full min-w-0 overflow-x-auto overflow-y-visible rounded-lg border border-slate-600/50 bg-slate-300/30 p-2 sm:p-3">
                  <div className="inline-block min-w-0 max-w-full">
                    <div className="min-w-0">
                      <TournamentBracketView
                        layout={bracket.layout}
                        themeColors={bracket.themeColors}
                        logoWatermarkUrl={branding.targetLogoPath}
                        parentOrganizationLogo={{
                          src: branding.parentLogoPath,
                          name: branding.parentName,
                        }}
                        parkInfo={bracket.parkInfo}
                        surfaceTitleOverride={bracket.name}
                      />
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-8 text-center">
            <h2 className="text-xl font-semibold text-zinc-100">No published tournament brackets yet</h2>
            <p className="mt-2 text-sm text-zinc-400">
              {site.shortName} will post tournament brackets here when they are ready.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
