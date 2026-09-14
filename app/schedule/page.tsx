import ScheduleTable from "@/components/ScheduleTable";
import prisma from "@/lib/prisma";
import { getOrgCapabilities } from "@/lib/org/capabilities";
import {
  loadPublicPracticeSlots,
  loadPublicScheduleGames,
  loadPublicScheduleWindow,
} from "@/lib/schedule/publicScheduleLoad";
import { getOrgId, getSiteConfig, type ContentOrgId } from "@/lib/siteConfig";
import { computeStandingsByAgeGroup, type AgeGroupStandings } from "@/lib/standings";

type ViewMode = "thisWeek" | "nextWeek" | "fullSeason";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Schedule & Standings | ${site.name}`,
    description: `Game and practice schedules for ${site.name}.`,
  };
}

function weekRange(mode: ViewMode, seasonStart: string, seasonEnd: string) {
  const now = new Date();
  if (mode === "fullSeason") return { startDate: seasonStart, endDate: seasonEnd };
  const start = new Date(now);
  if (mode === "thisWeek") {
    start.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
  } else {
    start.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? 1 : 8));
  }
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return {
    startDate: start.toISOString().split("T")[0]!,
    endDate: end.toISOString().split("T")[0]!,
  };
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const viewMode = (view as ViewMode) || "thisWeek";
  const site = getSiteConfig();
  const orgId = getOrgId() as ContentOrgId;
  const window = await loadPublicScheduleWindow(orgId);
  const { startDate, endDate } = weekRange(viewMode, window.startDate, window.endDate);

  let games = [] as Awaited<ReturnType<typeof loadPublicScheduleGames>>;
  let practices = [] as Awaited<ReturnType<typeof loadPublicPracticeSlots>>;
  let error: string | null = null;
  let standings: AgeGroupStandings[] = [];

  try {
    [games, practices] = await Promise.all([
      loadPublicScheduleGames({ org: orgId, startDate, endDate }),
      loadPublicPracticeSlots({
        org: orgId,
        seasonYear: window.seasonYear,
        startDate,
        endDate,
      }),
    ]);
  } catch (err: unknown) {
    error = err instanceof Error ? err.message : "Failed to load schedule";
  }

  try {
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
    standings = computeStandingsByAgeGroup(scores);
  } catch {
    standings = [];
  }

  const scheduleEnabled = getOrgCapabilities(orgId).schedule === "scheduler";

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-6xl px-4 pb-2 pt-8 sm:px-6 sm:pt-10">
        <h1 className="mb-1 text-2xl font-bold tracking-tight sm:text-3xl">Schedules</h1>
        <p className="text-sm text-zinc-400">
          {site.name} · {window.seasonName}
        </p>
      </div>
      {scheduleEnabled ? (
        <ScheduleTable
          siteName={site.name}
          seasonName={window.seasonName}
          initialGames={games}
          initialPractices={practices}
          initialError={error}
          currentViewMode={viewMode}
          standings={standings}
        />
      ) : (
        <p className="mx-auto max-w-6xl px-4 py-12 text-sm text-zinc-400">
          Schedules publish when the league season is set up in Scheduler.
        </p>
      )}
    </main>
  );
}
