import { collectLayoutMatchesForGc } from "@/lib/gamechanger/collectLayoutMatches";
import { bracketGameChangerSchema } from "@/lib/gamechanger/types";
import { isBracketFeederPlaceholder } from "@/lib/tournament-brackets/bracketScoring";
import { buildBracketLayout, type BracketLayout, type LayoutMatch } from "@/lib/tournament-brackets/bracketLayout";
import type { BracketGameRow, BracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import type { ScheduleManagerActionSummary, ScheduleManagerSkippedGame } from "@/lib/gamechanger/schedule-manager/types";

export type FindUnlockedGamesOptions = {
  bracketProjectId: string;
  seasonYear: number;
  spec: BracketSpec;
  existingActionMatchIds?: Iterable<string>;
};

export type FindUnlockedGamesResult = {
  planned: ScheduleManagerActionSummary[];
  skipped: ScheduleManagerSkippedGame[];
};

export function isBracketEligibleForScheduleManager(status: string, spec: BracketSpec): boolean {
  const gc = bracketGameChangerSchema.safeParse(spec.gameChanger);
  return status === "READY" && gc.success && Boolean(gc.data.widgetId) && gc.data.scheduleManagerEnabled === true;
}

function flattenLayoutMatches(layout: BracketLayout): Array<LayoutMatch | BracketGameRow> {
  if (layout.mode === "empty") return [];
  if (layout.mode === "match_grid") return layout.games;
  if (layout.mode === "double_elimination") {
    return [
      ...layout.winnersBracket.rounds.flatMap((round) => round.matches),
      ...(layout.losersBracket?.rounds.flatMap((round) => round.matches) ?? []),
      ...(layout.championship?.matches ?? []),
    ];
  }
  return [
    ...layout.rounds.flatMap((round) => round.matches),
    ...(layout.podium?.thirdPlaceGameInfo
      ? [
          {
            id: "__bracket_third_place__",
            home: layout.podium.thirdPlaceSlotHome,
            away: layout.podium.thirdPlaceSlotAway,
            slotHome: layout.podium.thirdPlaceSlotHome,
            slotAway: layout.podium.thirdPlaceSlotAway,
            ...layout.podium.thirdPlaceGameInfo,
            ...layout.podium.thirdPlaceScores,
          },
        ]
      : []),
  ];
}

function hasSavedScore(match: LayoutMatch | BracketGameRow): boolean {
  if (!("slotHome" in match)) return false;
  return match.homeScore != null || match.awayScore != null || match.winnerSide != null;
}

function labelForSide(match: LayoutMatch | BracketGameRow, side: "home" | "away"): string {
  if ("slotHome" in match) return side === "home" ? match.slotHome : match.slotAway;
  return side === "home" ? match.homeTeam : match.awayTeam;
}

function gameNumberFor(match: LayoutMatch | BracketGameRow): string | undefined {
  return "slotHome" in match ? match.officialGameNumber : match.gameNumber;
}

function parseScheduledFor(dateLabel: string | undefined, time: string | undefined, seasonYear: number): Date | undefined {
  const date = dateLabel?.trim();
  const clock = time?.trim();
  if (!date || !clock) return undefined;
  const candidates = [`${date} ${seasonYear} ${clock}`, `${date} ${clock}`, `${date}, ${seasonYear} ${clock}`];
  for (const candidate of candidates) {
    const value = Date.parse(candidate);
    if (Number.isFinite(value)) return new Date(value);
  }
  return undefined;
}

export function findUnlockedScheduleManagerGames(options: FindUnlockedGamesOptions): FindUnlockedGamesResult {
  const gc = bracketGameChangerSchema.safeParse(options.spec.gameChanger);
  if (!gc.success) return { planned: [], skipped: [] };

  const layout = buildBracketLayout(options.spec);
  const gcRefs = new Map(collectLayoutMatchesForGc(layout).map((ref) => [ref.id, ref]));
  const matches = flattenLayoutMatches(layout);
  const existingActionMatchIds = new Set(options.existingActionMatchIds ?? []);
  const pinnedMatchIds = new Set(Object.keys(gc.data.matchEventPins ?? {}));
  const planned: ScheduleManagerActionSummary[] = [];
  const skipped: ScheduleManagerSkippedGame[] = [];

  for (const match of matches) {
    const matchId = match.id;
    const ref = gcRefs.get(matchId);
    const homeTeam = (ref?.home ?? labelForSide(match, "home")).trim();
    const awayTeam = (ref?.away ?? labelForSide(match, "away")).trim();
    const scheduledFor = parseScheduledFor(ref?.dateLabel, ref?.time, options.seasonYear);

    if (pinnedMatchIds.has(matchId)) {
      skipped.push({ matchId, reason: "already_pinned" });
      continue;
    }
    if (existingActionMatchIds.has(matchId)) {
      skipped.push({ matchId, reason: "already_logged" });
      continue;
    }
    if (hasSavedScore(match)) {
      skipped.push({ matchId, reason: "already_scored" });
      continue;
    }
    if (!homeTeam || !awayTeam) {
      skipped.push({ matchId, reason: "missing_team" });
      continue;
    }
    if (isBracketFeederPlaceholder(homeTeam) || isBracketFeederPlaceholder(awayTeam)) {
      skipped.push({ matchId, reason: "placeholder_team" });
      continue;
    }
    if (!ref?.dateLabel || !ref.time) {
      skipped.push({ matchId, reason: "missing_schedule" });
      continue;
    }

    planned.push({
      bracketProjectId: options.bracketProjectId,
      matchId,
      divisionLabel: options.spec.divisionLabel,
      gameNumber: gameNumberFor(match),
      dateLabel: ref.dateLabel,
      time: ref.time,
      scheduledFor,
      venue: ref.venue,
      field: ref.field,
      homeTeam,
      awayTeam,
    });
  }

  return { planned, skipped };
}
