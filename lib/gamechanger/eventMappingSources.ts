import { fetchGameChangerScoreboardSyncWindow } from "@/lib/gamechanger/fetchScoreboard";
import {
  findGcEventForBracketMatch,
  resolveGcEventForBracketMatch,
} from "@/lib/gamechanger/matchEventsToBracket";
import { bracketGameChangerSchema, type GcBracketMatchRef, type GcScoreboardEvent } from "@/lib/gamechanger/types";
import { collectLayoutMatchesForGc } from "@/lib/gamechanger/collectLayoutMatches";
import { BYE_SLOT_LABEL } from "@/lib/tournament-brackets/generateSingleElimFromTeams";
import { formatBracketGameBadge } from "@/lib/tournament-brackets/bracketDisplayLabels";
import { buildBracketLayout } from "@/lib/tournament-brackets/bracketLayout";
import type { BracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import { BRACKET_THIRD_PLACE_MATCH_ID } from "@/lib/tournament-brackets/bracketScoring";

export type GcEventOption = {
  id: string;
  label: string;
  startTs: string;
  gameStatus?: string;
  homeTeam: string;
  awayTeam: string;
  scoreLabel?: string;
};

export type BracketMatchMappingRow = {
  matchId: string;
  label: string;
  badge?: string;
  home: string;
  away: string;
  scheduleLabel?: string;
  pinnedEventId?: string;
  suggestedEventId?: string;
  resolvedEventId?: string;
  pinMissingFromWindow?: boolean;
};

export type GameChangerEventMappingSources = {
  gameChangerConfigured: boolean;
  widgetId?: string;
  gameChangerError?: string;
  bracketMatches: BracketMatchMappingRow[];
  gameChangerEvents: GcEventOption[];
  matchEventPins: Record<string, string>;
};

function formatGcEventScore(event: GcScoreboardEvent): string | undefined {
  const h = event.home_team.score;
  const a = event.away_team.score;
  if (h == null && a == null) return undefined;
  return `${h ?? "–"}–${a ?? "–"}`;
}

export function formatGcEventOptionLabel(event: GcScoreboardEvent): string {
  const date = new Date(event.start_ts);
  const datePart = Number.isNaN(date.getTime())
    ? event.start_ts.slice(0, 10)
    : date.toLocaleString(undefined, { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
  const score = formatGcEventScore(event);
  const status = event.game_status?.trim();
  const statusPart = status ? ` · ${status}` : "";
  const scorePart = score ? ` · ${score}` : "";
  return `${datePart} · ${event.away_team.name} @ ${event.home_team.name}${scorePart}${statusPart}`;
}

function bracketMatchLabel(ref: GcBracketMatchRef): string {
  const badge = formatBracketGameBadge(ref.officialGameNumber);
  const teams = `${ref.home} vs ${ref.away}`;
  if (ref.id === BRACKET_THIRD_PLACE_MATCH_ID) {
    return badge ? `3rd place · ${badge} · ${teams}` : `3rd place · ${teams}`;
  }
  return badge ? `${badge} · ${teams}` : teams;
}

function scheduleLabel(ref: GcBracketMatchRef): string | undefined {
  const parts = [ref.dateLabel?.trim(), ref.time?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

export async function gameChangerEventMappingSourcesFromSpec(
  spec: BracketSpec,
): Promise<GameChangerEventMappingSources> {
  const layout = buildBracketLayout(spec);
  const bracketRefs = collectLayoutMatchesForGc(layout).filter((r) => {
    const h = r.home.trim().toUpperCase();
    const a = r.away.trim().toUpperCase();
    return h !== BYE_SLOT_LABEL && a !== BYE_SLOT_LABEL && h !== "TBD" && a !== "TBD";
  });

  const gcParsed = bracketGameChangerSchema.safeParse(spec.gameChanger);
  if (!gcParsed.success) {
    return {
      gameChangerConfigured: false,
      bracketMatches: bracketRefs.map((ref) => ({
        matchId: ref.id,
        label: bracketMatchLabel(ref),
        badge: formatBracketGameBadge(ref.officialGameNumber),
        home: ref.home,
        away: ref.away,
        scheduleLabel: scheduleLabel(ref),
      })),
      gameChangerEvents: [],
      matchEventPins: {},
    };
  }

  const gc = gcParsed.data;
  const pins = gc.matchEventPins ?? {};
  let events: GcScoreboardEvent[] = [];
  let gameChangerError: string | undefined;

  try {
    const fetched = await fetchGameChangerScoreboardSyncWindow(gc.widgetId);
    events = fetched.events;
  } catch (err: unknown) {
    gameChangerError = err instanceof Error ? err.message : String(err);
  }

  const eventOptions: GcEventOption[] = [...events]
    .sort((a, b) => b.start_ts.localeCompare(a.start_ts))
    .map((ev) => ({
      id: ev.id,
      label: formatGcEventOptionLabel(ev),
      startTs: ev.start_ts,
      gameStatus: ev.game_status,
      homeTeam: ev.home_team.name,
      awayTeam: ev.away_team.name,
      scoreLabel: formatGcEventScore(ev),
    }));

  const eventIds = new Set(events.map((e) => e.id));

  const bracketMatches: BracketMatchMappingRow[] = bracketRefs.map((ref) => {
    const pinnedEventId = pins[ref.id];
    const suggestedEventId = findGcEventForBracketMatch(ref, events)?.id;
    const resolvedEventId = resolveGcEventForBracketMatch(ref, events, pins)?.id;
    return {
      matchId: ref.id,
      label: bracketMatchLabel(ref),
      badge: formatBracketGameBadge(ref.officialGameNumber),
      home: ref.home,
      away: ref.away,
      scheduleLabel: scheduleLabel(ref),
      pinnedEventId,
      suggestedEventId,
      resolvedEventId,
      pinMissingFromWindow: Boolean(pinnedEventId && !eventIds.has(pinnedEventId)),
    };
  });

  return {
    gameChangerConfigured: true,
    widgetId: gc.widgetId,
    gameChangerError,
    bracketMatches,
    gameChangerEvents: eventOptions,
    matchEventPins: pins,
  };
}

/** Normalize client draft: drop empty values; omit auto (no pin). */
export function normalizeMatchEventPinsDraft(
  draft: Record<string, string | null | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [matchId, eventId] of Object.entries(draft)) {
    const trimmed = typeof eventId === "string" ? eventId.trim() : "";
    if (trimmed) out[matchId] = trimmed;
  }
  return out;
}
