import { assignrFetch, assignrFetchAllPages } from "@/lib/assignr/client";
import {
  getAssignrLeagueIdForOrg,
  getAssignrSiteId,
} from "@/lib/assignr/config";
import type {
  AssignrAssignment,
  AssignrGame,
  AssignrGameCreatePayload,
  AssignrGameUpdatePayload,
  AssignrListResponse,
} from "@/lib/assignr/types";
import type { AssignrGameImportRow } from "@/lib/assignr/gamesImportTypes";
import { buildGameUserDefinedId } from "@/lib/assignr/idempotency";
import type { ContentOrgId } from "@/lib/siteConfig";

export type ListAssignrGamesOptions = {
  startDate: string;
  endDate: string;
  leagueId?: string | number;
  siteId?: string;
  limit?: number;
  maxPages?: number;
  cache?: RequestCache;
  next?: { revalidate?: number | false; tags?: string[] };
};

export async function listAssignrGames(options: ListAssignrGamesOptions) {
  const siteId = options.siteId || getAssignrSiteId();
  if (!siteId) {
    throw new Error("Missing Assignr site id");
  }

  return assignrFetchAllPages<AssignrGame>({
    path: `/api/v2/sites/${siteId}/games`,
    collectionKey: "games",
    limit: options.limit,
    maxPages: options.maxPages,
    cache: options.cache,
    next: options.next,
    searchParams: {
      "search[start_date]": options.startDate,
      "search[end_date]": options.endDate,
      ...(options.leagueId !== undefined && options.leagueId !== ""
        ? { "search[league_id]": options.leagueId }
        : {}),
    },
  });
}

export async function getAssignrGame(gameId: string | number) {
  return assignrFetch<AssignrGame>(`/api/v2/games/${gameId}`);
}

function assignmentNeedsDetail(game: AssignrGame) {
  const assignments = game._embedded?.assignments ?? [];
  if (assignments.length === 0) return false;
  return assignments.some((assignment) => {
    return (
      assignment.position === undefined &&
      assignment.position_abbreviation === undefined &&
      !assignment._embedded?.position?.name
    );
  });
}

export async function enrichAssignrGamesWithAssignmentDetails(games: AssignrGame[]) {
  return Promise.all(
    games.map(async (game) => {
      if (!game.id || !assignmentNeedsDetail(game)) {
        return game;
      }

      try {
        const detailed = await getAssignrGame(game.id);
        return {
          ...game,
          _embedded: {
            ...game._embedded,
            assignments: detailed._embedded?.assignments ?? game._embedded?.assignments,
          },
        };
      } catch {
        return game;
      }
    }),
  );
}

export function assignrAssignmentSlotIsOpen(assignment: AssignrAssignment) {
  if (assignment._embedded?.official?.id !== undefined && assignment._embedded?.official?.id !== null) {
    return false;
  }
  return assignment.assigned !== true;
}

export function assignrGameHasOpenAssignmentSlots(game: AssignrGame) {
  const assignments = game._embedded?.assignments ?? [];
  if (assignments.length === 0) return true;
  return assignments.some((assignment) => assignrAssignmentSlotIsOpen(assignment));
}

export function filterAssignrGamesWithOpenAssignmentSlots(games: AssignrGame[]) {
  return games.filter((game) => assignrGameHasOpenAssignmentSlots(game));
}

export function mapImportRowToCreatePayload(
  row: AssignrGameImportRow,
  org: ContentOrgId,
): AssignrGameCreatePayload {
  const leagueId = getAssignrLeagueIdForOrg(org);
  return {
    localized_date: row.date,
    localized_time: row.time,
    venue_name: row.venue,
    subvenue: row.subVenue,
    home_team_name: row.homeTeam,
    away_team_name: row.awayTeam,
    age_group_name: row.ageGroup,
    league_id: leagueId ? Number.parseInt(leagueId, 10) : undefined,
    league_name: row.league || undefined,
    game_type_name: row.gameType || undefined,
    pattern_name: row.pattern || undefined,
    gender_name: row.gender || undefined,
    public_note_text: row.notes || undefined,
    private_note_text: row.assignorNotes || undefined,
    user_defined_id: buildGameUserDefinedId(row, leagueId),
  };
}

export async function createAssignrGame(org: ContentOrgId, payload: AssignrGameCreatePayload) {
  const siteId = getAssignrSiteId(org);
  if (!siteId) {
    throw new Error("Missing Assignr site id");
  }

  const body: AssignrGameCreatePayload = {
    ...payload,
    league_id:
      payload.league_id ??
      (getAssignrLeagueIdForOrg(org)
        ? Number.parseInt(getAssignrLeagueIdForOrg(org), 10)
        : undefined),
  };

  return assignrFetch<AssignrGame>(`/api/v2/sites/${siteId}/games`, {
    method: "POST",
    body,
    retryOnConflict: false,
  });
}

export async function updateAssignrGame(
  gameId: string | number,
  payload: AssignrGameUpdatePayload,
) {
  return assignrFetch<AssignrGame>(`/api/v2/games/${gameId}`, {
    method: "PUT",
    body: payload,
  });
}

export async function findAssignrGameByUserDefinedId(
  userDefinedId: string,
  options: { startDate: string; endDate: string; leagueId?: string },
) {
  const games = await listAssignrGames({
    startDate: options.startDate,
    endDate: options.endDate,
    leagueId: options.leagueId,
    cache: "no-store",
  });

  return games.find((game) => {
    const value = game.user_defined_id;
    return typeof value === "string" && value.trim() === userDefinedId;
  });
}

export type AssignrBulkGameUpdateRow = {
  gameId: string;
  localized_date?: string;
  localized_time?: string;
  venue_name?: string;
  subvenue?: string;
  home_team_name?: string;
  away_team_name?: string;
  age_group_name?: string;
  status?: string;
  is_public?: string;
  public_note_text?: string;
};

export async function listUnassignedOfficialGamesForSite(params: {
  siteId?: string;
  startDate?: string;
  endDate?: string;
  leagueId?: string | number;
}) {
  const siteId = params.siteId || getAssignrSiteId();
  if (!siteId) {
    throw new Error("Missing Assignr site id");
  }

  return assignrFetchAllPages<AssignrGame>({
    path: `/api/v2/sites/${siteId}/games/officials/unassigned`,
    collectionKey: "games",
    searchParams: {
      ...(params.startDate ? { "search[start_date]": params.startDate } : {}),
      ...(params.endDate ? { "search[end_date]": params.endDate } : {}),
      ...(params.leagueId ? { "search[league_id]": params.leagueId } : {}),
    },
    cache: "no-store",
  });
}

export async function listGlobalUnassignedGames() {
  return assignrFetchAllPages<AssignrGame>({
    path: "/api/v2/games/unassigned",
    collectionKey: "games",
    cache: "no-store",
  });
}

export async function searchAssignrGamesByDateRange(params: {
  startDate: string;
  endDate: string;
  leagueId?: string;
}) {
  const response = await listAssignrGames({
    startDate: params.startDate,
    endDate: params.endDate,
    leagueId: params.leagueId,
    cache: "no-store",
  });
  return response;
}

export type AssignrGamesListEnvelope = AssignrListResponse<"games", AssignrGame>;
