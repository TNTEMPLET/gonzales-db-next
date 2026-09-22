import type { Game } from "@/lib/fetchGames";
import type { AdminAssignrScope } from "@/lib/admin/assignrScopeShared";
import type { ContentOrgId } from "@/lib/siteConfig";

import type { PublicScheduleGame } from "./publicSchedule";
import { loadPublicScheduleGames, loadPublicScheduleWindow } from "./publicScheduleLoad";
import {
  filterPastScoreableGames,
  filterScoreEntryParks,
  leagueOrgsFromScope,
  scoreableToImportGame,
  type ScoreableGame,
} from "./scoreableGames";

export async function loadScoreableGames(
  org: ContentOrgId,
  asOf: Date = new Date(),
): Promise<ScoreableGame[]> {
  const window = await loadPublicScheduleWindow(org);
  const games = await loadPublicScheduleGames({
    org,
    startDate: window.startDate,
    endDate: window.endDate,
  });
  return filterPastScoreableGames(filterScoreEntryParks(games), asOf).map((game) => ({
    ...game,
    organizationId: org,
    seasonName: window.seasonName,
    seasonYear: window.seasonYear,
  }));
}

export async function loadScoreableGamesForOrgs(
  orgs: ContentOrgId[],
  asOf: Date = new Date(),
): Promise<ScoreableGame[]> {
  const batches = await Promise.all(orgs.map((org) => loadScoreableGames(org, asOf)));
  return batches.flat();
}

export async function loadPostedSeasonGames(org: ContentOrgId): Promise<{
  games: PublicScheduleGame[];
  seasonName: string;
  seasonYear: number;
}> {
  const window = await loadPublicScheduleWindow(org);
  const games = await loadPublicScheduleGames({
    org,
    startDate: window.startDate,
    endDate: window.endDate,
  });
  return { games, seasonName: window.seasonName, seasonYear: window.seasonYear };
}

export async function loadScoreableImportGames(
  scope: AdminAssignrScope,
  asOf: Date = new Date(),
): Promise<Game[]> {
  const games = await loadScoreableGamesForOrgs(leagueOrgsFromScope(scope), asOf);
  return games.map(scoreableToImportGame);
}
