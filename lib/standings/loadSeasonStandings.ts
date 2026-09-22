import prisma from "@/lib/prisma";
import { loadPostedSeasonGames } from "@/lib/schedule/scoreableGamesLoad";
import type { ContentOrgId } from "@/lib/siteConfig";
import {
  computeStandingsByAgeGroup,
  filterScoresForSeasonGames,
  type AgeGroupStandings,
} from "@/lib/standings";

export type SeasonStandingsResult = {
  standings: AgeGroupStandings[];
  seasonName: string;
  seasonYear: number;
};

export async function loadSeasonStandings(
  orgId: ContentOrgId,
): Promise<SeasonStandingsResult> {
  const { games, seasonName, seasonYear } = await loadPostedSeasonGames(orgId);
  if (games.length === 0) {
    return { standings: [], seasonName, seasonYear };
  }

  const scores = await prisma.gameScore.findMany({
    where: {
      organizationId: orgId,
      gameExternalId: { in: games.map((game) => game.id) },
    },
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

  return {
    standings: computeStandingsByAgeGroup(
      filterScoresForSeasonGames(
        scores,
        games.map((game) => game.id),
      ),
    ),
    seasonName,
    seasonYear,
  };
}
