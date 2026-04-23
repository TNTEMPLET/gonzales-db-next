import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminScoresManager from "@/components/admin/AdminScoresManager";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import { fetchGames } from "@/lib/fetchGames";
import prisma from "@/lib/prisma";
import {
  getAssignrLeagueId,
  getSiteConfig,
  resolveAdminTargetOrg,
} from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Game Scores | ${site.name}`,
    description: "Enter game scores and keep league standings current.",
  };
}

type ScoreEntryGame = {
  gameExternalId: string;
  ageGroup: string;
  homeTeam: string;
  awayTeam: string;
  gameDate: string | null;
  status: string;
  venue: string | null;
  subvenue: string | null;
};

function toIsoDate(source?: string) {
  if (!source) return null;
  const parsed = new Date(source);
  if (Number.isNaN(parsed.valueOf())) return null;
  return parsed.toISOString();
}

export default async function AdminScoresPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const orgId = resolveAdminTargetOrg(org);
  const leagueId = getAssignrLeagueId(orgId);

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    redirect("/admin/login?next=/admin/scores");
  }

  const [scores, games] = await Promise.all([
    prisma.gameScore.findMany({
      where: { organizationId: orgId },
      select: {
        gameExternalId: true,
        homeScore: true,
        awayScore: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
    fetchGames({
      startDate: "2026-03-01",
      endDate: "2026-06-30",
      leagueId,
    }),
  ]);

  const now = Date.now();
  const scoreEntryGames: ScoreEntryGame[] = games
    .map((game) => {
      const gameDate = toIsoDate(game.start_time || game.localized_date);
      return {
        gameExternalId: String(game.id),
        ageGroup: (game.age_group || "Unassigned").trim() || "Unassigned",
        homeTeam: game.home_team?.trim() || "Home Team",
        awayTeam: game.away_team?.trim() || "Away Team",
        gameDate,
        status: game.status?.trim() || "Scheduled",
        venue:
          game._embedded?.venue?.name ??
          (game.venue as string | undefined) ??
          null,
        subvenue: game.subvenue ?? null,
      };
    })
    .filter((game) => {
      if (!game.gameDate) return false;
      if (new Date(game.gameDate).valueOf() > now) return false;
      return game.status === "A" || game.status === "C";
    });

  return (
    <main className="min-h-screen bg-zinc-950 text-white py-14">
      <section className="max-w-6xl mx-auto px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="SCORE ENTRY"
            currentOrg={orgId}
            currentPath="/admin/scores"
          />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            Enter Game Scores
          </h1>
          <p className="text-zinc-400 max-w-2xl">
            Save final scores for completed games. Standings update from these
            scores by age group.
          </p>
        </div>

        <AdminScoresManager
          games={scoreEntryGames}
          existingScores={scores}
          targetOrg={orgId}
        />
      </section>
    </main>
  );
}
