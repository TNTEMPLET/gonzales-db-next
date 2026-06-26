import prisma from "@/lib/prisma";
import { fetchAssignrGamesForScope, type AdminAssignrScope } from "@/lib/admin/assignrOrgScope";
import { buildScoreEntryGames } from "@/lib/admin/scoreEntryGames";
import { collectLayoutMatchesForGc } from "@/lib/gamechanger/collectLayoutMatches";
import { bracketGameChangerSchema } from "@/lib/gamechanger/types";
import { buildBracketLayout } from "@/lib/tournament-brackets/bracketLayout";
import { BRACKET_THIRD_PLACE_MATCH_ID, scoresFromSpec } from "@/lib/tournament-brackets/bracketScoring";
import { safeParseBracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import { BRACKET_ORGS, getBracketOrgDisplayName, isBracketOrgId, type BracketOrgId, type ContentOrgId } from "@/lib/siteConfig";

export type UnifiedScoreSourceType = "LEAGUE" | "TOURNAMENT";
export type UnifiedScoreGame = {
  id: string; sourceType: UnifiedScoreSourceType; organizationId: BracketOrgId; organizationLabel: string;
  seasonYear: number; sourceKey: string; sourceLabel: string; projectId?: string; projectName?: string;
  gameExternalId: string; matchId: string; ageGroup: string; homeTeam: string; awayTeam: string;
  gameDate: string | null; dateLabel: string; timeLabel: string; venue: string | null; field: string | null;
  gameNumber: string | null; status: string; homeScore: number | null; awayScore: number | null;
  winnerSide?: "home" | "away"; scored: boolean; canManualScore: boolean; hasGameChanger: boolean; gameChangerWidgetId?: string;
};
export type UnifiedGameChangerConnection = {
  id?: string; organizationId: BracketOrgId; organizationLabel: string; seasonYear: number;
  sourceType: UnifiedScoreSourceType; sourceKey: string; sourceLabel: string; projectId?: string;
  widgetId: string; maxVerticalGamesVisible?: number | null; autoImportFinalScores: boolean;
};
export type UnifiedScoresPayload = { games: UnifiedScoreGame[]; connections: UnifiedGameChangerConnection[] };
type RawConnection = {
  id: string; organizationId: string; seasonYear: number; sourceType: UnifiedScoreSourceType; sourceKey: string;
  sourceLabel: string | null; widgetId: string; maxVerticalGamesVisible: number | null; autoImportFinalScores: boolean;
};
function connectionKey(sourceType: UnifiedScoreSourceType, organizationId: string, seasonYear: number, sourceKey: string) {
  return `${sourceType}:${organizationId}:${seasonYear}:${sourceKey}`;
}
export function leagueSourceKey() { return "league"; }
export function unifiedScoreGameId(sourceType: UnifiedScoreSourceType, organizationId: string, sourceKey: string, matchId: string) {
  return `${sourceType}:${organizationId}:${sourceKey}:${matchId}`;
}
function parseDateLabel(dateLabel?: string, seasonYear?: number): string | null {
  const m = dateLabel?.trim().match(/^(\d{1,2})\/(\d{1,2})$/); if (!m) return null;
  const date = new Date(Date.UTC(seasonYear ?? new Date().getFullYear(), Number(m[1]) - 1, Number(m[2]), 12));
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}
function formatLeagueDate(value: string | null) {
  if (!value) return "Date TBD"; const parsed = new Date(value); if (Number.isNaN(parsed.valueOf())) return "Date TBD";
  return parsed.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function sortGames(a: UnifiedScoreGame, b: UnifiedScoreGame) {
  const ad = a.gameDate ? Date.parse(a.gameDate) : Infinity; const bd = b.gameDate ? Date.parse(b.gameDate) : Infinity;
  if (ad !== bd) return ad - bd; if (a.organizationLabel !== b.organizationLabel) return a.organizationLabel.localeCompare(b.organizationLabel);
  if (a.sourceType !== b.sourceType) return a.sourceType.localeCompare(b.sourceType);
  return `${a.sourceLabel} ${a.homeTeam}`.localeCompare(`${b.sourceLabel} ${b.homeTeam}`);
}
function connectionToPayload(row: RawConnection): UnifiedGameChangerConnection | null {
  if (!isBracketOrgId(row.organizationId)) return null;
  return { id: row.id, organizationId: row.organizationId, organizationLabel: getBracketOrgDisplayName(row.organizationId), seasonYear: row.seasonYear,
    sourceType: row.sourceType, sourceKey: row.sourceKey, sourceLabel: row.sourceLabel || (row.sourceType === "LEAGUE" ? `${getBracketOrgDisplayName(row.organizationId)} League` : "Tournament"),
    ...(row.sourceType === "TOURNAMENT" ? { projectId: row.sourceKey } : {}), widgetId: row.widgetId, maxVerticalGamesVisible: row.maxVerticalGamesVisible,
    autoImportFinalScores: row.autoImportFinalScores };
}
function isMissingOptionalScoresTableError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  const message = error instanceof Error ? error.message : String(error);
  return code === "P2021" || code === "P2022" || /does not exist|relation .* does not exist|table .* does not exist/i.test(message);
}


async function loadGameChangerConnections(allOrgs: string[], seasonYear: number): Promise<RawConnection[]> {
  if (!allOrgs.length) return [];
  const client = prisma as unknown as { gameChangerScoreboardConnection?: { findMany(args: unknown): Promise<RawConnection[]> } };
  if (!client.gameChangerScoreboardConnection) return [];
  try {
    return await client.gameChangerScoreboardConnection.findMany({
      where: { seasonYear, organizationId: { in: allOrgs } },
      select: { id: true, organizationId: true, seasonYear: true, sourceType: true, sourceKey: true, sourceLabel: true, widgetId: true, maxVerticalGamesVisible: true, autoImportFinalScores: true },
      orderBy: [{ sourceType: "asc" }, { sourceLabel: "asc" }],
    }) as RawConnection[];
  } catch (error: unknown) {
    if (isMissingOptionalScoresTableError(error)) return [];
    throw error;
  }
}
async function loadReadyBracketProjects(tournamentOrgs: BracketOrgId[]) {
  if (!tournamentOrgs.length) return [];
  try {
    return await prisma.bracketProject.findMany({
      where: { organizationId: { in: tournamentOrgs }, status: "READY" },
      select: { id: true, organizationId: true, seasonYear: true, name: true, status: true, spec: true, priority: true, updatedAt: true },
      orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
    });
  } catch (error: unknown) {
    console.error("[admin-scores] Failed to load ready brackets with priority order", error);
    return await prisma.bracketProject.findMany({
      where: { organizationId: { in: tournamentOrgs }, status: "READY" },
      select: { id: true, organizationId: true, seasonYear: true, name: true, status: true, spec: true, updatedAt: true },
      orderBy: [{ updatedAt: "desc" }],
    });
  }
}


export async function listUnifiedScoreGames(params: { scope: AdminAssignrScope; seasonYear: number; startDate: string; endDate: string }): Promise<UnifiedScoresPayload> {
  const tournamentOrgs: BracketOrgId[] = params.scope === "all" ? [...BRACKET_ORGS] : isBracketOrgId(params.scope) ? [params.scope] : [];
  const leagueOrgs: ContentOrgId[] = [];
  const allOrgs = Array.from(new Set([...leagueOrgs, ...tournamentOrgs]));
  const [assignrGames, existingScores, bracketProjects, rawConnections] = await Promise.all([
    leagueOrgs.length ? fetchAssignrGamesForScope({ scope: params.scope, startDate: params.startDate, endDate: params.endDate }) : Promise.resolve([]),
    leagueOrgs.length ? prisma.gameScore.findMany({ where: { organizationId: { in: leagueOrgs } }, select: { organizationId: true, gameExternalId: true, homeScore: true, awayScore: true } }) : Promise.resolve([]),
    loadReadyBracketProjects(tournamentOrgs),
    loadGameChangerConnections(allOrgs, params.seasonYear),
  ]);
  const connections = rawConnections.map(connectionToPayload).filter((x): x is UnifiedGameChangerConnection => Boolean(x));
  const connectionsByKey = new Map(connections.map((c) => [connectionKey(c.sourceType, c.organizationId, c.seasonYear, c.sourceKey), c]));
  const scoresByKey = new Map(existingScores.map((score) => [`${score.organizationId}:${score.gameExternalId}`, score]));
  const games: UnifiedScoreGame[] = [];
  for (const row of buildScoreEntryGames(assignrGames, params.scope)) {
    if (!leagueOrgs.includes(row.organizationId)) continue;
    const saved = scoresByKey.get(`${row.organizationId}:${row.gameExternalId}`);
    const conn = connectionsByKey.get(connectionKey("LEAGUE", row.organizationId, params.seasonYear, leagueSourceKey()));
    games.push({
      id: unifiedScoreGameId("LEAGUE", row.organizationId, leagueSourceKey(), row.gameExternalId), sourceType: "LEAGUE", organizationId: row.organizationId,
      organizationLabel: getBracketOrgDisplayName(row.organizationId), seasonYear: params.seasonYear, sourceKey: leagueSourceKey(), sourceLabel: `${getBracketOrgDisplayName(row.organizationId)} League`,
      gameExternalId: row.gameExternalId, matchId: row.gameExternalId, ageGroup: row.ageGroup, homeTeam: row.homeTeam, awayTeam: row.awayTeam,
      gameDate: row.gameDate, dateLabel: formatLeagueDate(row.gameDate), timeLabel: "", venue: row.venue, field: row.subvenue, gameNumber: null, status: row.status,
      homeScore: saved?.homeScore ?? null, awayScore: saved?.awayScore ?? null, scored: saved != null, canManualScore: row.status === "A", hasGameChanger: Boolean(conn?.widgetId), gameChangerWidgetId: conn?.widgetId,
    });
  }
  for (const project of bracketProjects) {
    try {
    if (!isBracketOrgId(project.organizationId)) continue;
    const parsed = safeParseBracketSpec(project.spec); if (!parsed.ok) continue;
    let refs; try { refs = collectLayoutMatchesForGc(buildBracketLayout(parsed.spec)); } catch { continue; }
    const savedScores = scoresFromSpec(parsed.spec);
    const legacyGc = bracketGameChangerSchema.safeParse(parsed.spec.gameChanger);
    const conn = connectionsByKey.get(connectionKey("TOURNAMENT", project.organizationId, project.seasonYear, project.id));
    const widgetId = conn?.widgetId || (legacyGc.success ? legacyGc.data.widgetId : undefined);
    if (!conn && widgetId) {
      connections.push({ organizationId: project.organizationId, organizationLabel: getBracketOrgDisplayName(project.organizationId), seasonYear: project.seasonYear,
        sourceType: "TOURNAMENT", sourceKey: project.id, sourceLabel: project.name, projectId: project.id, widgetId,
        maxVerticalGamesVisible: legacyGc.success ? legacyGc.data.maxVerticalGamesVisible ?? null : null,
        autoImportFinalScores: legacyGc.success ? legacyGc.data.autoImportFinalScores !== false : true });
    }
    for (const ref of refs) {
      const score = savedScores[ref.id]; const dateIso = parseDateLabel(ref.dateLabel, project.seasonYear);
      games.push({
        id: unifiedScoreGameId("TOURNAMENT", project.organizationId, project.id, ref.id), sourceType: "TOURNAMENT", organizationId: project.organizationId,
        organizationLabel: getBracketOrgDisplayName(project.organizationId), seasonYear: project.seasonYear, sourceKey: project.id, sourceLabel: project.name, projectId: project.id, projectName: project.name,
        gameExternalId: ref.id, matchId: ref.id, ageGroup: parsed.spec.championAgeGroupLabel || parsed.spec.divisionLabel || parsed.spec.rosterAgeGroup || "Tournament",
        homeTeam: ref.home, awayTeam: ref.away, gameDate: dateIso, dateLabel: ref.dateLabel || "Date TBD", timeLabel: ref.time || "", venue: null, field: null,
        gameNumber: ref.officialGameNumber ?? (ref.id === BRACKET_THIRD_PLACE_MATCH_ID ? "3rd" : null), status: String(project.status), homeScore: score?.homeScore ?? null,
        awayScore: score?.awayScore ?? null, winnerSide: score?.winnerSide, scored: score?.homeScore != null && score?.awayScore != null, canManualScore: true,
        hasGameChanger: Boolean(widgetId), gameChangerWidgetId: widgetId,
      });
    }
    } catch (error: unknown) {
      console.error("[admin-scores] Failed to normalize bracket project", project.id, error);
    }
  }
  return { games: games.sort(sortGames), connections };
}

export function inferSourceTargets(games: UnifiedScoreGame[]) {
  const seen = new Set<string>();
  return games.flatMap((game) => {
    const key = connectionKey(game.sourceType, game.organizationId, game.seasonYear, game.sourceKey); if (seen.has(key)) return [];
    seen.add(key);
    return [{ sourceType: game.sourceType, organizationId: game.organizationId, organizationLabel: game.organizationLabel, seasonYear: game.seasonYear, sourceKey: game.sourceKey, sourceLabel: game.sourceLabel, projectId: game.projectId }];
  });
}
