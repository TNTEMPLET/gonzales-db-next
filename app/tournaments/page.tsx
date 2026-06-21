import Image from "next/image";
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

const DISTRICT2_TOURNAMENT_RULES = [
  "Teams MUST arrive at least one hour prior to the scheduled game time and check in with the Tournament Director upon arrival. Teams who do not arrive or check in at least one hour prior to their scheduled game time will forfeit the coin toss to the opposing team.",
  "Lineups MUST be turned in 45 minutes prior to the scheduled game time.",
  "NO coolers, outside food, or beverages are allowed in the complex. This applies to empty Yeti cups as well.",
  "Cell phones, tablets, or any other electronic device may be used in the dugout provided these devices are NOT used for communication purposes.",
  "Managers and coaches must wear appropriate clothing. Appropriate clothing includes slacks, blue jeans, coaching shorts, golf-type shirts or similar type, and proper footwear. Holey pants or shirts, t-shirts or any shirt with tobacco, sex, or alcoholic products, cut-offs, short shorts, and sandals are examples of inappropriate clothing. The Tournament/Game Director has the final decision on appropriate dress.",
  "The players, one manager, and two coaches ONLY are allowed on the field and/or in the dugout before, during, and after games. Exception: Tee Ball and Coach Pitch may have a maximum of four coaches in the dugout.",
  "All players must stay inside the dugout at ALL times except when entered into the game and/or playing on defense.",
  "Spectators are NOT allowed on the playing field or in the dugout at any time, including before, during, and after games.",
  "Little League Rule 3.09 prohibits spectators from interacting with players, coaches, managers, or umpires during play. This rule will be strictly enforced.",
  "ABSOLUTELY NO sunflower seeds, gum, or peanuts are allowed in the complex. This applies to spectators, coaches, and players.",
  "No metal cleats are allowed on any of the fields or in the batting cages.",
];

function District2ParkAndRules() {
  return (
    <section className="mt-8 grid gap-6">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/75 p-4 sm:p-5">
        <div className="mb-4">
          <p className="inline-flex rounded-full bg-brand-purple px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
            Park Information
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-white">
            Butch Gore Memorial Park
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Field layout, gate, parking, and umpire parking areas.
          </p>
        </div>
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
          <Image
            src="/images/district2/butch-gore-park-graphic.png"
            alt="Butch Gore Memorial Park field and parking map"
            width={1024}
            height={576}
            className="h-auto w-full"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/75 p-5 sm:p-6">
        <p className="inline-flex rounded-full bg-brand-purple px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
          Tournament Rules
        </p>
        <h2 className="mt-3 text-2xl font-bold tracking-tight text-white">
          Ground Rules
        </h2>
        <ol className="mt-4 space-y-3 text-sm leading-6 text-zinc-300">
          {DISTRICT2_TOURNAMENT_RULES.map((rule, index) => (
            <li key={rule} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-brand-gold">
                {index + 1}
              </span>
              <span>{rule}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

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
  const showDistrict2ParkAndRules = org === "ladistrict2";
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
          <>
            <PublishedTournamentTabs
              brackets={tabBrackets}
              branding={branding}
              initialSelectedBracketId={requestedBracketId}
            />
            {showDistrict2ParkAndRules ? <District2ParkAndRules /> : null}
          </>
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
