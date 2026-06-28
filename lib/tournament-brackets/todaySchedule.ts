import { collectLayoutMatchesForGc } from "@/lib/gamechanger/collectLayoutMatches";
import { buildLivePayloadFromEvents } from "@/lib/gamechanger/matchEventsToBracket";
import { fetchGameChangerScoreboardSyncWindow } from "@/lib/gamechanger/fetchScoreboard";
import { bracketGameChangerSchema } from "@/lib/gamechanger/types";
import { formatBracketGameBadge } from "@/lib/tournament-brackets/bracketDisplayLabels";
import { buildBracketLayout } from "@/lib/tournament-brackets/bracketLayout";
import { isByeBracketMatch } from "@/lib/tournament-brackets/bracketScoring";
import { safeParseBracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import {
  compareScheduleFields,
  formatTodayScheduleHeading,
  isBracketDateToday,
  normalizeScheduleField,
  parseBracketTimeSortKey,
} from "@/lib/tournament-brackets/todayScheduleUtils";
import type { BracketOrgId } from "@/lib/siteConfig";
import prisma from "@/lib/prisma";

export type TodayScheduleGame = {
  matchId: string;
  bracketProjectId: string;
  bracketName: string;
  divisionLabel: string;
  gameBadge?: string;
  homeTeam: string;
  awayTeam: string;
  time?: string;
  timeSortKey: number;
  field: string;
  venue?: string;
  statusLabel: string;
  scoreLabel?: string;
  inningLabel?: string;
  isLive: boolean;
  bracketHref: string;
};

export type TodayScheduleFieldGroup = {
  field: string;
  games: TodayScheduleGame[];
};

export type TodayScheduleResult = {
  dateHeading: string;
  fieldGroups: TodayScheduleFieldGroup[];
  totalGames: number;
  liveGames: number;
  polledAt: string;
};

export async function buildTodayScheduleForOrg(organizationId: BracketOrgId): Promise<TodayScheduleResult> {
  const projects = await prisma.bracketProject.findMany({
    where: {
      organizationId,
      status: "READY",
    },
    orderBy: [{ seasonYear: "desc" }, { priority: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      seasonYear: true,
      spec: true,
    },
  });

  const scoreboardCache = new Map<string, Awaited<ReturnType<typeof fetchGameChangerScoreboardSyncWindow>>>();
  const games: TodayScheduleGame[] = [];

  for (const project of projects) {
    const parsed = safeParseBracketSpec(project.spec);
    if (!parsed.ok) continue;

    let layout;
    try {
      layout = buildBracketLayout(parsed.spec);
    } catch {
      continue;
    }
    if (layout.mode === "empty") continue;

    const bracketMatches = collectLayoutMatchesForGc(layout);
    const todaysMatches = bracketMatches.filter(
      (match) =>
        isBracketDateToday(match.dateLabel, project.seasonYear) &&
        !isByeBracketMatch({ home: match.home, away: match.away }),
    );
    if (todaysMatches.length === 0) continue;

    const gcParsed = parsed.spec.gameChanger
      ? bracketGameChangerSchema.safeParse(parsed.spec.gameChanger)
      : null;
    let livePayload: ReturnType<typeof buildLivePayloadFromEvents> | null = null;

    if (gcParsed?.success?.widgetId) {
      try {
        if (!scoreboardCache.has(gcParsed.data.widgetId)) {
          scoreboardCache.set(
            gcParsed.data.widgetId,
            await fetchGameChangerScoreboardSyncWindow(gcParsed.data.widgetId),
          );
        }
        const scoreboard = scoreboardCache.get(gcParsed.data.widgetId)!;
        livePayload = buildLivePayloadFromEvents(
          bracketMatches,
          scoreboard.events,
          scoreboard.response.next_update,
          gcParsed.data.matchEventPins,
        );
      } catch (error: unknown) {
        console.warn(
          `[today-schedule] GameChanger fetch failed for ${project.id}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    const divisionLabel =
      parsed.spec.divisionLabel?.trim() || parsed.spec.tournamentInfo?.division?.trim() || project.name;

    for (const match of todaysMatches) {
      const liveStatus = livePayload?.liveGameStatuses[match.id];
      const isLive = liveStatus?.statusLabel === "LIVE";
      games.push({
        matchId: match.id,
        bracketProjectId: project.id,
        bracketName: project.name,
        divisionLabel,
        gameBadge: formatBracketGameBadge(match.officialGameNumber),
        homeTeam: match.home,
        awayTeam: match.away,
        time: match.time?.trim() || undefined,
        timeSortKey: parseBracketTimeSortKey(match.time),
        field: normalizeScheduleField(match.field, match.venue),
        venue: match.venue?.trim() || undefined,
        statusLabel: liveStatus?.statusLabel ?? "Scheduled",
        scoreLabel: liveStatus?.scoreLabel,
        inningLabel: liveStatus?.inningLabel,
        isLive,
        bracketHref: `/tournaments?bracket=${encodeURIComponent(project.id)}`,
      });
    }
  }

  games.sort((left, right) => {
    const fieldCompare = compareScheduleFields(left.field, right.field);
    if (fieldCompare !== 0) return fieldCompare;
    if (left.timeSortKey !== right.timeSortKey) return left.timeSortKey - right.timeSortKey;
    return left.divisionLabel.localeCompare(right.divisionLabel, "en-US");
  });

  const fieldGroupsMap = new Map<string, TodayScheduleGame[]>();
  for (const game of games) {
    const bucket = fieldGroupsMap.get(game.field) ?? [];
    bucket.push(game);
    fieldGroupsMap.set(game.field, bucket);
  }

  const fieldGroups = Array.from(fieldGroupsMap.entries())
    .sort(([leftField], [rightField]) => compareScheduleFields(leftField, rightField))
    .map(([field, fieldGames]) => ({ field, games: fieldGames }));

  return {
    dateHeading: formatTodayScheduleHeading(),
    fieldGroups,
    totalGames: games.length,
    liveGames: games.filter((game) => game.isLive).length,
    polledAt: new Date().toISOString(),
  };
}
