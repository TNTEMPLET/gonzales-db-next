import prisma from "@/lib/prisma";
import type { AdminAssignrScope } from "@/lib/admin/assignrScopeShared";
import { leagueSourceKey, unifiedScoreGameId } from "@/lib/admin/unifiedScoreKeys";
import { leagueOrgsFromScope, type ScoreableGame } from "@/lib/schedule/scoreableGames";
import { loadScoreableGamesForOrgs } from "@/lib/schedule/scoreableGamesLoad";
import {
  getOrgDisplayName,
  isContentOrgId,
  type ContentOrgId,
} from "@/lib/siteConfig";

export type UnifiedScoreSourceType = "LEAGUE" | "TOURNAMENT";
export type UnifiedScoreGame = {
  id: string;
  sourceType: UnifiedScoreSourceType;
  organizationId: ContentOrgId;
  organizationLabel: string;
  seasonYear: number;
  sourceKey: string;
  sourceLabel: string;
  projectId?: string;
  projectName?: string;
  gameExternalId: string;
  matchId: string;
  ageGroup: string;
  homeTeam: string;
  awayTeam: string;
  gameDate: string | null;
  dateLabel: string;
  timeLabel: string;
  venue: string | null;
  field: string | null;
  gameNumber: string | null;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  winnerSide?: "home" | "away";
  scored: boolean;
  canManualScore: boolean;
  hasGameChanger: boolean;
  gameChangerWidgetId?: string;
};
export type UnifiedGameChangerConnection = {
  id?: string;
  organizationId: ContentOrgId;
  organizationLabel: string;
  seasonYear: number;
  sourceType: UnifiedScoreSourceType;
  sourceKey: string;
  sourceLabel: string;
  projectId?: string;
  widgetId: string;
  maxVerticalGamesVisible?: number | null;
  autoImportFinalScores: boolean;
};
export type UnifiedScoresPayload = {
  games: UnifiedScoreGame[];
  connections: UnifiedGameChangerConnection[];
};

type RawConnection = {
  id: string;
  organizationId: string;
  seasonYear: number;
  sourceType: UnifiedScoreSourceType;
  sourceKey: string;
  sourceLabel: string | null;
  widgetId: string;
  maxVerticalGamesVisible: number | null;
  autoImportFinalScores: boolean;
};

function connectionKey(
  sourceType: UnifiedScoreSourceType,
  organizationId: string,
  seasonYear: number,
  sourceKey: string,
) {
  return `${sourceType}:${organizationId}:${seasonYear}:${sourceKey}`;
}

export { leagueSourceKey, unifiedScoreGameId };

function sortGames(a: UnifiedScoreGame, b: UnifiedScoreGame) {
  const ad = a.gameDate ? Date.parse(a.gameDate) : Infinity;
  const bd = b.gameDate ? Date.parse(b.gameDate) : Infinity;
  if (ad !== bd) return ad - bd;
  if (a.timeLabel !== b.timeLabel) return a.timeLabel.localeCompare(b.timeLabel);
  if (a.organizationLabel !== b.organizationLabel) {
    return a.organizationLabel.localeCompare(b.organizationLabel);
  }
  return `${a.ageGroup} ${a.homeTeam}`.localeCompare(`${b.ageGroup} ${b.homeTeam}`);
}

function connectionToPayload(row: RawConnection): UnifiedGameChangerConnection | null {
  if (!isContentOrgId(row.organizationId)) return null;
  return {
    id: row.id,
    organizationId: row.organizationId,
    organizationLabel: getOrgDisplayName(row.organizationId),
    seasonYear: row.seasonYear,
    sourceType: row.sourceType,
    sourceKey: row.sourceKey,
    sourceLabel:
      row.sourceLabel ||
      (row.sourceType === "LEAGUE"
        ? `${getOrgDisplayName(row.organizationId)} League`
        : "Tournament"),
    widgetId: row.widgetId,
    maxVerticalGamesVisible: row.maxVerticalGamesVisible,
    autoImportFinalScores: row.autoImportFinalScores,
  };
}

function isMissingOptionalScoresTableError(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
  const message = error instanceof Error ? error.message : String(error);
  const details = typeof error === "object" && error ? JSON.stringify(error) : "";
  return (
    code === "P2021" ||
    code === "P2022" ||
    /does not exist|relation .* does not exist|table .* does not exist|TableDoesNotExist|GameChangerScoreboardConnection/i.test(
      message + " " + details,
    )
  );
}

async function loadGameChangerConnections(
  allOrgs: string[],
  seasonYear: number,
): Promise<RawConnection[]> {
  if (!allOrgs.length) return [];
  const client = prisma as unknown as {
    gameChangerScoreboardConnection?: {
      findMany(args: unknown): Promise<RawConnection[]>;
    };
  };
  if (!client.gameChangerScoreboardConnection) return [];
  try {
    return (await client.gameChangerScoreboardConnection.findMany({
      where: { seasonYear, organizationId: { in: allOrgs }, sourceType: "LEAGUE" },
      select: {
        id: true,
        organizationId: true,
        seasonYear: true,
        sourceType: true,
        sourceKey: true,
        sourceLabel: true,
        widgetId: true,
        maxVerticalGamesVisible: true,
        autoImportFinalScores: true,
      },
      orderBy: [{ sourceLabel: "asc" }],
    })) as RawConnection[];
  } catch (error: unknown) {
    if (isMissingOptionalScoresTableError(error)) return [];
    throw error;
  }
}

function toUnifiedLeagueGame(
  row: ScoreableGame,
  saved: { homeScore: number; awayScore: number } | undefined,
  widgetId: string | undefined,
): UnifiedScoreGame {
  return {
    id: unifiedScoreGameId("LEAGUE", row.organizationId, leagueSourceKey(), row.id),
    sourceType: "LEAGUE",
    organizationId: row.organizationId,
    organizationLabel: getOrgDisplayName(row.organizationId),
    seasonYear: row.seasonYear,
    sourceKey: leagueSourceKey(),
    sourceLabel: `${getOrgDisplayName(row.organizationId)} League`,
    gameExternalId: row.id,
    matchId: row.id,
    ageGroup: row.ageGroup.trim() || "Unassigned",
    homeTeam: row.homeTeam,
    awayTeam: row.awayTeam,
    gameDate: `${row.dateKey}T12:00:00.000Z`,
    dateLabel: row.dateLabel,
    timeLabel: row.timeLabel,
    venue: row.parkName,
    field: row.fieldName,
    gameNumber: null,
    status: "A",
    homeScore: saved?.homeScore ?? null,
    awayScore: saved?.awayScore ?? null,
    scored: saved != null,
    canManualScore: true,
    hasGameChanger: Boolean(widgetId),
    gameChangerWidgetId: widgetId,
  };
}

export async function listUnifiedScoreGames(params: {
  scope: AdminAssignrScope;
  seasonYear: number;
  startDate?: string;
  endDate?: string;
}): Promise<UnifiedScoresPayload> {
  const leagueOrgs = leagueOrgsFromScope(params.scope);
  const [scoreableGames, existingScores, rawConnections] = await Promise.all([
    leagueOrgs.length ? loadScoreableGamesForOrgs(leagueOrgs) : Promise.resolve([]),
    leagueOrgs.length
      ? prisma.gameScore.findMany({
          where: { organizationId: { in: leagueOrgs } },
          select: {
            organizationId: true,
            gameExternalId: true,
            homeScore: true,
            awayScore: true,
          },
        })
      : Promise.resolve([]),
    loadGameChangerConnections(leagueOrgs, params.seasonYear),
  ]);

  const connections = rawConnections
    .map(connectionToPayload)
    .filter((row): row is UnifiedGameChangerConnection => Boolean(row));
  const connectionsByKey = new Map(
    connections.map((connection) => [
      connectionKey(
        connection.sourceType,
        connection.organizationId,
        connection.seasonYear,
        connection.sourceKey,
      ),
      connection,
    ]),
  );
  const scoresByKey = new Map(
    existingScores.map((score) => [
      `${score.organizationId}:${score.gameExternalId}`,
      score,
    ]),
  );

  const games = scoreableGames.map((row) => {
    const saved = scoresByKey.get(`${row.organizationId}:${row.id}`);
    const conn = connectionsByKey.get(
      connectionKey("LEAGUE", row.organizationId, row.seasonYear, leagueSourceKey()),
    );
    return toUnifiedLeagueGame(row, saved, conn?.widgetId);
  });

  return { games: games.sort(sortGames), connections };
}

export function inferSourceTargets(games: UnifiedScoreGame[]) {
  const seen = new Set<string>();
  return games.flatMap((game) => {
    const key = connectionKey(
      game.sourceType,
      game.organizationId,
      game.seasonYear,
      game.sourceKey,
    );
    if (seen.has(key)) return [];
    seen.add(key);
    return [
      {
        sourceType: game.sourceType,
        organizationId: game.organizationId,
        organizationLabel: game.organizationLabel,
        seasonYear: game.seasonYear,
        sourceKey: game.sourceKey,
        sourceLabel: game.sourceLabel,
        projectId: game.projectId,
      },
    ];
  });
}
