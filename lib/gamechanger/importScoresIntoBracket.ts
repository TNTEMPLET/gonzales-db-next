import { bracketEventOrientation, resolveGcEventForBracketMatch } from "@/lib/gamechanger/matchEventsToBracket";
import type { GcBracketMatchRef, GcScoreboardEvent } from "@/lib/gamechanger/types";
import type { BracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import {
  BRACKET_THIRD_PLACE_MATCH_ID,
  mergeMatchScoresIntoSpec,
  type BracketMatchScores,
} from "@/lib/tournament-brackets/bracketScoring";

export type GcScoreImportResult = {
  spec: BracketSpec;
  importedMatchIds: string[];
  skipped: { matchId: string; reason: string }[];
};

function isCompletedEvent(event: GcScoreboardEvent): boolean {
  return event.game_status === "completed";
}

/** Map a completed GC event to bracket home/away scores (handles swapped home/away). */
export function gcEventToBracketMatchScores(
  ref: GcBracketMatchRef,
  event: GcScoreboardEvent,
): BracketMatchScores | null {
  if (!isCompletedEvent(event)) return null;

  const gcHome = event.home_team.score;
  const gcAway = event.away_team.score;
  if (gcHome == null || gcAway == null) return null;

  const flipped = bracketEventOrientation(ref, event) === "swapped";

  const homeScore = flipped ? gcAway : gcHome;
  const awayScore = flipped ? gcHome : gcAway;

  if (homeScore === awayScore) {
    return { homeScore, awayScore };
  }

  return {
    homeScore,
    awayScore,
    winnerSide: homeScore > awayScore ? "home" : "away",
  };
}

export type ImportGcScoresOptions = {
  /** Only import events with game_status completed (default true). */
  onlyCompleted?: boolean;
  /** Limit to these bracket match ids (e.g. newly finalized). */
  matchIds?: string[];
  /** Skip matches that already have the same scores saved. */
  skipUnchanged?: boolean;
  /** Bracket match id → GameChanger event UUID (admin pins). */
  matchEventPins?: Record<string, string> | null;
};

function scoresMatchSaved(
  spec: BracketSpec,
  matchId: string,
  next: BracketMatchScores,
): boolean {
  if (matchId === BRACKET_THIRD_PLACE_MATCH_ID) {
    const g = spec.thirdPlaceGame;
    if (!g) return false;
    return (
      g.homeScore === next.homeScore &&
      g.awayScore === next.awayScore &&
      (next.winnerSide == null || g.winnerSide === next.winnerSide)
    );
  }
  for (const r of spec.rounds) {
    for (const m of r.matches) {
      if (m.id !== matchId) continue;
      return (
        m.homeScore === next.homeScore &&
        m.awayScore === next.awayScore &&
        (next.winnerSide == null || m.winnerSide === next.winnerSide)
      );
    }
  }
  return false;
}

/**
 * Apply completed GameChanger scores onto bracket matches and advance the tree.
 */
export function importGcScoresIntoBracket(
  spec: BracketSpec,
  bracketMatches: GcBracketMatchRef[],
  events: GcScoreboardEvent[],
  options: ImportGcScoresOptions = {},
): GcScoreImportResult {
  const onlyCompleted = options.onlyCompleted !== false;
  const skipUnchanged = options.skipUnchanged !== false;
  const matchIdFilter = options.matchIds ? new Set(options.matchIds) : null;

  const updates: Record<string, BracketMatchScores> = {};
  const importedMatchIds: string[] = [];
  const skipped: { matchId: string; reason: string }[] = [];

  for (const ref of bracketMatches) {
    if (matchIdFilter && !matchIdFilter.has(ref.id)) continue;

    const event = resolveGcEventForBracketMatch(ref, events, options.matchEventPins);
    if (!event) {
      skipped.push({ matchId: ref.id, reason: "no_gamechanger_match" });
      continue;
    }
    if (onlyCompleted && !isCompletedEvent(event)) {
      skipped.push({ matchId: ref.id, reason: "not_final" });
      continue;
    }

    const scores = gcEventToBracketMatchScores(ref, event);
    if (!scores) {
      skipped.push({ matchId: ref.id, reason: "missing_scores" });
      continue;
    }

    if (skipUnchanged && scoresMatchSaved(spec, ref.id, scores)) {
      skipped.push({ matchId: ref.id, reason: "unchanged" });
      continue;
    }

    updates[ref.id] = scores;
    importedMatchIds.push(ref.id);
  }

  if (importedMatchIds.length === 0) {
    return { spec, importedMatchIds, skipped };
  }

  const merged = mergeMatchScoresIntoSpec(spec, updates);
  return { spec: merged, importedMatchIds, skipped };
}
