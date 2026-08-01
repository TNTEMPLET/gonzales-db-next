// lib/fetchGames.ts
import { listAssignrGames } from "@/lib/assignr/games";
import { ASSIGNR_GAMES_CACHE_TAG } from "@/lib/assignr/cacheTags";
import type { AssignrGame } from "@/lib/assignr/types";
import { getSiteConfig } from "@/lib/siteConfig";

export type Game = AssignrGame;

type FetchGamesOptions = {
  startDate: string;
  endDate: string;
  leagueId?: string | number;
  limit?: number;
  maxPages?: number;
  cache?: RequestCache;
};

export async function fetchGames({
  startDate,
  endDate,
  leagueId,
  limit = 50,
  maxPages = 20,
  cache,
}: FetchGamesOptions): Promise<Game[]> {
  const site = getSiteConfig();
  const effectiveLeagueId = leagueId ?? site.assignrLeagueId;

  return listAssignrGames({
    startDate,
    endDate,
    leagueId: effectiveLeagueId,
    siteId: site.assignrSiteId || undefined,
    limit,
    maxPages,
    cache: cache ?? "default",
    next: { revalidate: 300, tags: [ASSIGNR_GAMES_CACHE_TAG] },
  });
}
