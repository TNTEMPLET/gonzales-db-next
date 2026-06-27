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
    .trim()
    .replace(/^(?:\d{1,2}u|coach pitch|tee ball|t-ball|majors?|minors?)\s+/i, "")
    .replace(/\s+(?:ll|llb)$/i, "")
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
  if (event.game_status === "live" || isLiveGcEvent(event)) return "LIVE";
  if (event.game_status === "completed") return "Final";
  return "Scheduled";
}

/** Bracket schedule is America/Chicago (CDT, UTC−5 in May). */
function parseBracketScheduleMs(ref: GcBracketMatchRef, year = new Date().getFullYear()): number | undefined {
  const dateLabel = ref.dateLabel?.trim();
  if (!dateLabel) return undefined;
  const m = dateLabel.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return undefined;
  const month = Number(m[1]) - 1;
  const day = Number(m[2]);
  let hours = 18;
  let minutes = 0;
  const time = ref.time?.trim();
  if (time) {
    const tm = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (tm) {
      hours = Number(tm[1]);
      minutes = Number(tm[2]);
      const ap = tm[3]!.toUpperCase();
      if (ap === "PM" && hours !== 12) hours += 12;
      if (ap === "AM" && hours === 12) hours = 0;
    }
  }
  return Date.UTC(year, month, day, hours + 5, minutes, 0);
}

function gcEventStatusRank(event: GcScoreboardEvent): number {
  return (
    (event.game_status === "live" ? 4 : 0) +
    (event.home_team.score != null ? 2 : 0) +
    (event.game_status === "completed" ? 1 : 0)
  );
}

function gcEventSortKey(event: GcScoreboardEvent, ref: GcBracketMatchRef): [number, number, number] {
  const statusRank = gcEventStatusRank(event);
  const scheduledMs = parseBracketScheduleMs(ref);
  const startMs = Date.parse(event.start_ts);
  const proximity =
    scheduledMs != null && Number.isFinite(startMs)
      ? -Math.abs(startMs - scheduledMs)
      : Number.isFinite(startMs)
        ? startMs
        : 0;
  return [statusRank, proximity, startMs];
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
    const ka = gcEventSortKey(a, ref);
    const kb = gcEventSortKey(b, ref);
    for (let i = 0; i < ka.length; i++) {
      if (kb[i]! !== ka[i]!) return kb[i]! - ka[i]!;
    }
    return 0;
  })[0];
}

/** Admin-pinned GameChanger event takes precedence over team-name matching. */
export function resolveGcEventForBracketMatch(
  ref: GcBracketMatchRef,
  events: GcScoreboardEvent[],
  matchEventPins?: Record<string, string> | null,
): GcScoreboardEvent | undefined {
  if (isBracketByeMatch(ref)) return undefined;
  const pinnedId = matchEventPins?.[ref.id]?.trim();
  if (pinnedId) {
    const byId = events.find((ev) => ev.id === pinnedId);
    if (byId) return byId;
  }
  return findGcEventForBracketMatch(ref, events);
}

export function buildLivePayloadFromEvents(
  bracketMatches: GcBracketMatchRef[],
  events: GcScoreboardEvent[],
  nextUpdate?: string,
  matchEventPins?: Record<string, string> | null,
): GcLiveMatchPayload {
  const liveGameStatuses: Record<string, GcLiveGameStatus> = {};
  const matchEventIds: Record<string, string> = {};
  const eventsByMatchId: Record<string, GcScoreboardEvent> = {};

  for (const ref of bracketMatches) {
    const event = resolveGcEventForBracketMatch(ref, events, matchEventPins);
    if (!event) continue;

    matchEventIds[ref.id] = event.id;
    eventsByMatchId[ref.id] = event;
    const live = isLiveGcEvent(event);
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
