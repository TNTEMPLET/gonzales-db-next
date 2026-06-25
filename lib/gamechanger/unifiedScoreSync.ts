import prisma from "@/lib/prisma";
import { fetchAssignrGamesForScope } from "@/lib/admin/assignrOrgScope";
import { buildScoreEntryGames } from "@/lib/admin/scoreEntryGames";
import { leagueSourceKey, type UnifiedScoreSourceType } from "@/lib/admin/unifiedScoreSources";
import { fetchGameChangerScoreboardSyncWindow } from "@/lib/gamechanger/fetchScoreboard";
import { gcEventToBracketMatchScores, importGcScoresIntoBracket } from "@/lib/gamechanger/importScoresIntoBracket";
import { resolveGcEventForBracketMatch } from "@/lib/gamechanger/matchEventsToBracket";
import { collectLayoutMatchesForGc } from "@/lib/gamechanger/collectLayoutMatches";
import { buildBracketLayout } from "@/lib/tournament-brackets/bracketLayout";
import { safeParseBracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import { getScoreboardConnection, mirrorTournamentImportedIdsToSpec, parseJsonStringArray, parseMatchEventPins, updateConnectionImportedEventIds } from "@/lib/gamechanger/scoreboardConnections";
import { isBracketOrgId, isContentOrgId, type BracketOrgId } from "@/lib/siteConfig";
import { SEASON_END_DATE, SEASON_START_DATE } from "@/lib/seasonConfig";
import type { GcBracketMatchRef, GcScoreboardEvent } from "@/lib/gamechanger/types";

export type GameChangerScorePreviewRow = {
  matchId: string; homeTeam: string; awayTeam: string; gameLabel: string; eventId?: string; eventStatus?: string;
  eventHomeTeam?: string; eventAwayTeam?: string; homeScore?: number | null; awayScore?: number | null;
  outcome: "matched" | "completed" | "live" | "unmatched" | "missing_scores";
};
export type GameChangerScoreSyncResult = { rows: GameChangerScorePreviewRow[]; importedCount: number; skippedCount: number; organizationName?: string };
function completedEventIds(rows: GameChangerScorePreviewRow[]) { return rows.flatMap((row) => row.outcome === "completed" && row.eventId ? [row.eventId] : []); }
function previewRows(refs: GcBracketMatchRef[], events: GcScoreboardEvent[], pins: Record<string, string>) {
  return refs.map((ref) => {
    const event = resolveGcEventForBracketMatch(ref, events, pins); const scores = event ? gcEventToBracketMatchScores(ref, event) : null;
    const base = { matchId: ref.id, homeTeam: ref.home, awayTeam: ref.away, gameLabel: ref.officialGameNumber ? `Game ${ref.officialGameNumber}` : ref.id,
      eventId: event?.id, eventStatus: event?.game_status, eventHomeTeam: event?.home_team.name, eventAwayTeam: event?.away_team.name, homeScore: scores?.homeScore ?? null, awayScore: scores?.awayScore ?? null };
    if (!event) return { ...base, outcome: "unmatched" as const };
    if (event.game_status === "completed" && scores) return { ...base, outcome: "completed" as const };
    if (event.game_status === "completed") return { ...base, outcome: "missing_scores" as const };
    if (event.game_status === "live") return { ...base, outcome: "live" as const };
    return { ...base, outcome: "matched" as const };
  });
}
async function refsForLeague(params: { organizationId: BracketOrgId }) {
  if (!isContentOrgId(params.organizationId)) return [];
  const games = await fetchAssignrGamesForScope({ scope: params.organizationId, startDate: SEASON_START_DATE, endDate: SEASON_END_DATE });
  return buildScoreEntryGames(games, params.organizationId).map((game) => ({ id: game.gameExternalId, home: game.homeTeam, away: game.awayTeam } satisfies GcBracketMatchRef));
}
async function refsForTournament(projectId: string) {
  const project = await prisma.bracketProject.findUnique({ where: { id: projectId } });
  if (!project || !isBracketOrgId(project.organizationId)) throw new Error("Tournament project not found.");
  const parsed = safeParseBracketSpec(project.spec); if (!parsed.ok) throw new Error("Tournament bracket spec is invalid.");
  return { project, spec: parsed.spec, refs: collectLayoutMatchesForGc(buildBracketLayout(parsed.spec)) };
}
export async function previewGameChangerScores(params: { sourceType: UnifiedScoreSourceType; organizationId: BracketOrgId; seasonYear: number; sourceKey: string }): Promise<GameChangerScoreSyncResult> {
  const connection = await getScoreboardConnection(params); if (!connection) throw new Error("Connect a GameChanger scoreboard before previewing scores.");
  const fetched = await fetchGameChangerScoreboardSyncWindow(connection.widgetId); const pins = parseMatchEventPins(connection.matchEventPins);
  const refs = params.sourceType === "LEAGUE" ? await refsForLeague(params) : (await refsForTournament(params.sourceKey)).refs;
  const rows = previewRows(refs, fetched.events, pins);
  return { rows, importedCount: 0, skippedCount: rows.filter((row) => row.outcome !== "completed").length, organizationName: fetched.response.data.organization.name };
}
export async function importCompletedGameChangerScores(params: { sourceType: UnifiedScoreSourceType; organizationId: BracketOrgId; seasonYear: number; sourceKey: string; enteredByAdminId?: string | null }): Promise<GameChangerScoreSyncResult> {
  const connection = await getScoreboardConnection(params); if (!connection) throw new Error("Connect a GameChanger scoreboard before importing scores.");
  const importedIds = new Set(parseJsonStringArray(connection.importedFinalEventIds)); const pins = parseMatchEventPins(connection.matchEventPins);
  const fetched = await fetchGameChangerScoreboardSyncWindow(connection.widgetId);
  if (params.sourceType === "LEAGUE") {
    const refs = await refsForLeague(params); const rows = previewRows(refs, fetched.events, pins); let importedCount = 0;
    for (const ref of refs) {
      const event = resolveGcEventForBracketMatch(ref, fetched.events, pins); if (!event || event.game_status !== "completed" || importedIds.has(event.id)) continue;
      const scores = gcEventToBracketMatchScores(ref, event); if (!scores || scores.homeScore == null || scores.awayScore == null) continue;
      await prisma.gameScore.upsert({
        where: { organizationId_gameExternalId: { organizationId: params.organizationId, gameExternalId: ref.id } },
        create: { organizationId: params.organizationId, gameExternalId: ref.id, ageGroup: "GameChanger", homeTeam: ref.home, awayTeam: ref.away, gameDate: null, homeScore: scores.homeScore, awayScore: scores.awayScore, enteredByAdminId: params.enteredByAdminId ?? null },
        update: { homeTeam: ref.home, awayTeam: ref.away, homeScore: scores.homeScore, awayScore: scores.awayScore, enteredByAdminId: params.enteredByAdminId ?? null },
      });
      importedIds.add(event.id); importedCount += 1;
    }
    await updateConnectionImportedEventIds({ connectionId: connection.id, importedFinalEventIds: [...importedIds] });
    return { rows, importedCount, skippedCount: Math.max(rows.length - importedCount, 0), organizationName: fetched.response.data.organization.name };
  }
  const { project, spec, refs } = await refsForTournament(params.sourceKey); const rows = previewRows(refs, fetched.events, pins);
  const importResult = importGcScoresIntoBracket(spec, refs, fetched.events, { onlyCompleted: true, skipUnchanged: true, matchEventPins: pins });
  if (importResult.importedMatchIds.length > 0) await prisma.bracketProject.update({ where: { id: project.id }, data: { spec: JSON.parse(JSON.stringify(importResult.spec)) } });
  for (const eventId of completedEventIds(rows)) importedIds.add(eventId);
  await updateConnectionImportedEventIds({ connectionId: connection.id, importedFinalEventIds: [...importedIds] });
  await mirrorTournamentImportedIdsToSpec(project.id, [...importedIds]);
  return { rows, importedCount: importResult.importedMatchIds.length, skippedCount: importResult.skipped.length, organizationName: fetched.response.data.organization.name };
}
export function normalizeSourceKey(sourceType: UnifiedScoreSourceType, sourceKey: string) { return sourceType === "LEAGUE" ? leagueSourceKey() : sourceKey.trim(); }
