import type {
  GcBracketMatchRef,
  GcLiveGameStatus,
  GcLiveMatchPayload,
  GcScoreboardEvent,
} from "@/lib/gamechanger/types";
import { pollIntervalFromNextUpdate } from "@/lib/gamechanger/fetchScoreboard";
import { BYE_SLOT_LABEL } from "@/lib/tournament-brackets/generateSingleElimFromTeams";

export function normalizeTeamNameForMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[''`]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim();
}

function teamsMatchPair(
  bracketHome: string,
  bracketAway: string,
  eventHome: string,
  eventAway: string,
): boolean {
  const bh = normalizeTeamNameForMatch(bracketHome);
  const ba = normalizeTeamNameForMatch(bracketAway);
  const eh = normalizeTeamNameForMatch(eventHome);
  const ea = normalizeTeamNameForMatch(eventAway);
  if (!bh || !ba || !eh || !ea) return false;
  return (bh === eh && ba === ea) || (bh === ea && ba === eh);
}

function isBracketByeMatch(ref: GcBracketMatchRef): boolean {
  const h = ref.home.trim().toUpperCase();
  const a = ref.away.trim().toUpperCase();
  return h === BYE_SLOT_LABEL || a === BYE_SLOT_LABEL || h === "TBD" || a === "TBD";
}

function inningLabel(event: GcScoreboardEvent): string | undefined {
  const inning = event.sport_specific?.bats?.inning_details;
  if (!inning) return undefined;
  const half = inning.half === "top" ? "Top" : "Bot";
  return `${half} ${inning.inning}`;
}

export function isLiveGcEvent(event: GcScoreboardEvent): boolean {
  if (event.game_status === "live") return true;
  if (event.game_status === "completed") return false;
  const hasInning = Boolean(event.sport_specific?.bats?.inning_details);
  const hasScores =
    event.home_team.score != null ||
    event.away_team.score != null;
  return hasInning && hasScores;
}

/** @deprecated use isLiveGcEvent */
const isLiveEvent = isLiveGcEvent;

export function hasLiveGamesInEventsByMatchId(
  eventsByMatchId: Record<string, GcScoreboardEvent>,
): boolean {
  return Object.values(eventsByMatchId).some(isLiveGcEvent);
}

function scoreLabelForEvent(event: GcScoreboardEvent, ref: GcBracketMatchRef): string {
  const homeScore = event.home_team.score;
  const awayScore = event.away_team.score;
  if (homeScore == null && awayScore == null) return "—";

  const bh = normalizeTeamNameForMatch(ref.home);
  const eh = normalizeTeamNameForMatch(event.home_team.name);
  const flipped = bh !== eh;

  const left = flipped ? awayScore : homeScore;
  const right = flipped ? homeScore : awayScore;
  const l = left ?? "—";
  const r = right ?? "—";
  return `${l}–${r}`;
}

function statusLabelForEvent(event: GcScoreboardEvent): string {
  if (event.game_status === "live" || isLiveEvent(event)) return "LIVE";
  if (event.game_status === "completed") return "Final";
  return "Scheduled";
}

export function findGcEventForBracketMatch(
  ref: GcBracketMatchRef,
  events: GcScoreboardEvent[],
): GcScoreboardEvent | undefined {
  if (isBracketByeMatch(ref)) return undefined;

  const candidates = events.filter((ev) =>
    teamsMatchPair(ref.home, ref.away, ev.home_team.name, ev.away_team.name),
  );

  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];

  return candidates.sort((a, b) => {
    const scoreA =
      (a.game_status === "live" ? 4 : 0) +
      (a.home_team.score != null ? 2 : 0) +
      (a.game_status === "completed" ? 1 : 0);
    const scoreB =
      (b.game_status === "live" ? 4 : 0) +
      (b.home_team.score != null ? 2 : 0) +
      (b.game_status === "completed" ? 1 : 0);
    return scoreB - scoreA;
  })[0];
}

export function buildLivePayloadFromEvents(
  bracketMatches: GcBracketMatchRef[],
  events: GcScoreboardEvent[],
  nextUpdate?: string,
): GcLiveMatchPayload {
  const liveGameStatuses: Record<string, GcLiveGameStatus> = {};
  const matchEventIds: Record<string, string> = {};
  const eventsByMatchId: Record<string, GcScoreboardEvent> = {};

  for (const ref of bracketMatches) {
    const event = findGcEventForBracketMatch(ref, events);
    if (!event) continue;

    matchEventIds[ref.id] = event.id;
    eventsByMatchId[ref.id] = event;
    const live = isLiveEvent(event);
    const scoreLabel = scoreLabelForEvent(event, ref);
    const inning = inningLabel(event);
    const statusLabel = statusLabelForEvent(event);

    if (live || event.game_status === "completed" || scoreLabel !== "—") {
      liveGameStatuses[ref.id] = {
        scoreLabel,
        inningLabel: live ? inning : undefined,
        statusLabel: live ? "LIVE" : statusLabel,
      };
    }
  }

  const hasLiveGames = hasLiveGamesInEventsByMatchId(eventsByMatchId);

  return {
    liveGameStatuses,
    matchEventIds,
    eventsByMatchId,
    hasLiveGames,
    nextPollMs: pollIntervalFromNextUpdate(nextUpdate),
  };
}
