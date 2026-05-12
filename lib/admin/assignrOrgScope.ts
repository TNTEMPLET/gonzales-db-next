import {
  enrichAssignrGamesWithAssignmentDetails,
  filterAssignrGamesWithOpenAssignmentSlots,
  listAssignrGames,
} from "@/lib/assignr/games";
import { resolveAssignrDeskDateRange } from "@/lib/admin/assignrDeskDateRange";
import type { ListAssignrGamesOptions } from "@/lib/assignr/games";
import { fetchGames, type Game } from "@/lib/fetchGames";
import {
  CONTENT_ORGS,
  getAssignrLeagueId,
  getDefaultContentOrg,
  getOrgDisplayName,
  isContentOrgId,
  isMasterDeployment,
  resolveAdminTargetOrg,
  type ContentOrgId,
} from "@/lib/siteConfig";

export type AdminAssignrScope = ContentOrgId | "all";

export function resolveAdminAssignrScope(
  requestedOrg?: string | null,
): AdminAssignrScope {
  if (isMasterDeployment()) {
    if (requestedOrg && isContentOrgId(requestedOrg)) {
      return requestedOrg;
    }
    return "all";
  }
  return resolveAdminTargetOrg(requestedOrg);
}

export function isAllSitesAssignrScope(scope: AdminAssignrScope): scope is "all" {
  return scope === "all";
}

export function assignrScopeToQueryParam(scope: AdminAssignrScope): string {
  return scope === "all" ? "" : `org=${scope}`;
}

export function assignrHubHref(org?: ContentOrgId | null) {
  return org ? `/admin/assignr?org=${org}` : "/admin/assignr";
}

export function assignrScopeLabel(scope: AdminAssignrScope) {
  if (scope === "all") return "All Sites";
  return getOrgDisplayName(scope);
}

export function gameBelongsToContentOrg(game: Game, org: ContentOrgId) {
  const inferred = inferContentOrgFromGame(game);
  if (inferred) return inferred === org;

  const leagueId = readLeagueId(game);
  if (leagueId) return leagueId === getAssignrLeagueId(org);

  return false;
}

export function filterAssignrGamesForContentOrg(games: Game[], org: ContentOrgId) {
  return games.filter((game) => gameBelongsToContentOrg(game, org));
}

export async function fetchAssignrGamesForContentOrg(
  org: ContentOrgId,
  options: Omit<ListAssignrGamesOptions, "leagueId">,
) {
  const games = await listAssignrGames({
    ...options,
    leagueId: undefined,
  });
  return filterAssignrGamesForContentOrg(games, org);
}

export async function fetchUnassignedAssignrGamesForContentOrg(
  org: ContentOrgId,
  params: { startDate?: string; endDate?: string; siteId?: string },
) {
  const { startDate, endDate } = resolveAssignrDeskDateRange(params);
  const games = await fetchAssignrGamesForContentOrg(org, {
    startDate,
    endDate,
    cache: "no-store",
    ...(params.siteId ? { siteId: params.siteId } : {}),
  });
  const detailedGames = await enrichAssignrGamesWithAssignmentDetails(games);
  return filterAssignrGamesWithOpenAssignmentSlots(detailedGames);
}

export async function fetchAssignrGamesForScope(params: {
  scope: AdminAssignrScope;
  startDate: string;
  endDate: string;
}) {
  if (!isAllSitesAssignrScope(params.scope)) {
    return fetchGames({
      startDate: params.startDate,
      endDate: params.endDate,
      leagueId: getAssignrLeagueId(params.scope),
    });
  }

  const gamesByOrg = await Promise.all(
    CONTENT_ORGS.map((org) =>
      fetchGames({
        startDate: params.startDate,
        endDate: params.endDate,
        leagueId: getAssignrLeagueId(org),
      }),
    ),
  );

  const seen = new Set<string>();
  const merged: Game[] = [];
  for (const games of gamesByOrg) {
    for (const game of games) {
      const id = String(game.id ?? "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      merged.push(game);
    }
  }
  return merged;
}

function readLeagueId(game: Game) {
  const embeddedLeague = game._embedded?.league;
  if (embeddedLeague && typeof embeddedLeague === "object") {
    const id = (embeddedLeague as { id?: string | number }).id;
    if (id !== undefined && id !== null) {
      return String(id).trim();
    }
  }

  const directLeagueId = game.league_id;
  if (directLeagueId !== undefined && directLeagueId !== null) {
    return String(directLeagueId).trim();
  }

  return "";
}

export function inferContentOrgFromGame(game: Game): ContentOrgId | null {
  const leagueId = readLeagueId(game);
  if (leagueId) {
    for (const org of CONTENT_ORGS) {
      if (getAssignrLeagueId(org) === leagueId) {
        return org;
      }
    }
  }

  const ageGroup =
    typeof game.age_group === "string" ? game.age_group.trim().toUpperCase() : "";
  if (ageGroup.includes("LLB")) return "ascension";
  if (
    ageGroup.includes("DYB") ||
    ageGroup.includes("DBB") ||
    ageGroup.includes(" CP")
  ) {
    return "gonzales";
  }

  return null;
}

export function buildAgeGroupsByOrg(games: Game[]) {
  const ageGroupsByOrg: Record<ContentOrgId, string[]> = {
    gonzales: [],
    ascension: [],
  };
  const seenByOrg: Record<ContentOrgId, Set<string>> = {
    gonzales: new Set(),
    ascension: new Set(),
  };

  for (const game of games) {
    const ageGroup =
      typeof game.age_group === "string" ? game.age_group.trim() : "";
    if (!ageGroup) continue;

    const org = inferContentOrgFromGame(game) ?? getDefaultContentOrg();
    if (seenByOrg[org].has(ageGroup)) continue;
    seenByOrg[org].add(ageGroup);
    ageGroupsByOrg[org].push(ageGroup);
  }

  for (const org of CONTENT_ORGS) {
    ageGroupsByOrg[org].sort((a, b) => a.localeCompare(b));
  }

  return ageGroupsByOrg;
}

export function listAgeGroupsForScope(
  games: Game[],
  scope: AdminAssignrScope,
) {
  if (!isAllSitesAssignrScope(scope)) {
    return buildAgeGroupsByOrg(games)[scope];
  }

  const ageGroupsByOrg = buildAgeGroupsByOrg(games);
  return Array.from(
    new Set(CONTENT_ORGS.flatMap((org) => ageGroupsByOrg[org])),
  ).sort((a, b) => a.localeCompare(b));
}

export function inferContentOrgFromAgeGroup(
  ageGroup: string | null | undefined,
): ContentOrgId | null {
  const normalized = ageGroup?.trim().toUpperCase() ?? "";
  if (!normalized) return null;
  if (normalized.includes("LLB")) return "ascension";
  if (
    normalized.includes("DYB") ||
    normalized.includes("DBB") ||
    normalized.includes(" CP")
  ) {
    return "gonzales";
  }
  return null;
}
