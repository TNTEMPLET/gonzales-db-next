import Link from "next/link";
import { connection } from "next/server";

import PublishedTournamentTabs, { type PublishedTournamentTabBracket } from "@/components/brackets/PublishedTournamentTabs";
import prisma from "@/lib/prisma";
import { bracketGameChangerSchema, type BracketGameChanger } from "@/lib/gamechanger/types";
import { safeParseBracketSpec, type BracketParkInfo, type BracketTournamentInfo, type BracketVisualTuning } from "@/lib/tournament-brackets/bracketSpec";
import { resolveBracketThemeColors, type BracketThemeColors } from "@/lib/tournament-brackets/bracketTheme";
import { buildBracketLayout, type BracketLayout } from "@/lib/tournament-brackets/bracketLayout";
import { sortPublishedBrackets } from "@/lib/tournament-brackets/publishedBracketSort";
import { bracketWatermarkSrc } from "@/lib/tournament-brackets/bracketWatermark";
import {
  getBracketOrgDisplayName,
  getBracketOrgForDeployment,
  getContentOrgBrandColors,
  getSiteConfig,
  getTournamentBracketBrandingForOrg,
  isMasterDeployment,
} from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

type PublishedBracket = {
  id: string;
  name: string;
  seasonYear: number;
  priority: number;
  updatedAt: Date;
  divisionLabel?: string | null;
  layout: BracketLayout;
  parkInfo?: BracketParkInfo | null;
  tournamentInfo?: BracketTournamentInfo | null;
  visualTuning?: BracketVisualTuning | null;
  themeColors: BracketThemeColors;
  logoWatermarkUrl: string;
  gameChanger?: BracketGameChanger | null;
};

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Tournaments | ${site.name}`,
    description: `Published tournament brackets for ${site.name}.`,
  };
}

export default async function TournamentsPage({
  searchParams,
}: {
  searchParams: Promise<{ bracket?: string }>;
}) {
  await connection();
  const { bracket: requestedBracketId } = await searchParams;
  const site = getSiteConfig();
  const org = getBracketOrgForDeployment();
  const showAdminCreatorLink = isMasterDeployment();
  const adminCreatorHref = `/admin/tournament-brackets?org=${encodeURIComponent(org)}`;
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
      priority: true,
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
      const gcParsed = parsed.spec.gameChanger
        ? bracketGameChangerSchema.safeParse(parsed.spec.gameChanger)
        : null;

      return [
        {
          id: project.id,
          name: project.name,
          seasonYear: project.seasonYear,
          priority: project.priority,
          updatedAt: project.updatedAt,
          divisionLabel: parsed.spec.divisionLabel,
          layout: buildBracketLayout(parsed.spec),
          parkInfo: parsed.spec.parkInfo,
          tournamentInfo: parsed.spec.tournamentInfo,
          visualTuning: parsed.spec.visualTuning,
          themeColors: resolveBracketThemeColors(parsed.spec, siteThemeDefaults),
          logoWatermarkUrl: bracketWatermarkSrc(
            parsed.spec.flyer?.logoUrl,
            branding.targetLogoPath,
            project.updatedAt,
          ),
          gameChanger: gcParsed?.success ? gcParsed.data : null,
        },
      ];
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[bracket-layout] public tournaments ${project.id}: ${message}`);
      return [];
    }
  });

  const sortedBrackets = sortPublishedBrackets(brackets);
  const tabBrackets: PublishedTournamentTabBracket[] = sortedBrackets.map((bracket) => ({
    id: bracket.id,
    name: bracket.name,
    seasonYear: bracket.seasonYear,
    updatedAtLabel: bracket.updatedAt.toLocaleDateString("en-US"),
    layout: bracket.layout,
    parkInfo: bracket.parkInfo,
    tournamentInfo: bracket.tournamentInfo,
    visualTuning: bracket.visualTuning,
    themeColors: bracket.themeColors,
    logoWatermarkUrl: bracket.logoWatermarkUrl,
    gameChanger: bracket.gameChanger ?? null,
  }));

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8 sm:mb-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="inline-block rounded-full bg-brand-purple px-4 py-2 text-[11px] tracking-[2px] sm:px-6 sm:text-xs sm:tracking-[3px]">
                TOURNAMENTS
              </div>
              <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-5xl">Tournament Brackets</h1>
            </div>
            {showAdminCreatorLink ? (
              <Link
                href={adminCreatorHref}
                className="inline-flex w-fit items-center justify-center rounded-full border border-zinc-700 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-200 transition hover:border-brand-gold hover:text-brand-gold"
              >
                Back to Bracket Creator
              </Link>
            ) : null}
          </div>
          <p className="mt-3 max-w-2xl text-sm text-zinc-400">
            Published brackets for {getBracketOrgDisplayName(org)} tournaments. Check back here for updates as games are
            completed.
          </p>
        </div>

        {tabBrackets.length > 0 ? (
          <PublishedTournamentTabs
            brackets={tabBrackets}
            branding={branding}
            initialSelectedBracketId={requestedBracketId}
          />
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
