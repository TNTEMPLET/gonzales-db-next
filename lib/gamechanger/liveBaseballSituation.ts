import { normalizeTeamNameForMatch } from "@/lib/gamechanger/matchEventsToBracket";
import type { GcBracketMatchRef, GcScoreboardEvent } from "@/lib/gamechanger/types";

export type BracketSide = "home" | "away";

export type LiveBaseballSituation = {
  inningLabel?: string;
  /** Bracket home/away slot that is currently batting. */
  battingSide?: BracketSide;
  balls?: number;
  strikes?: number;
  /** Outs in the current half inning (0–2). */
  outsInHalf?: number;
};

function inningLabelFromEvent(event: GcScoreboardEvent): string | undefined {
  const inning = event.sport_specific?.bats?.inning_details;
  if (!inning) return undefined;
  const half = inning.half === "top" ? "Top" : "Bot";
  return `${half} ${inning.inning}`;
}

function gcTeamSideBatting(event: GcScoreboardEvent): BracketSide | undefined {
  const half = event.sport_specific?.bats?.inning_details?.half;
  if (half === "top") return "away";
  if (half === "bottom") return "home";
  return undefined;
}

function mapGcSideToBracketSide(
  gcSide: BracketSide,
  bracketMatch: GcBracketMatchRef,
  event: GcScoreboardEvent,
): BracketSide {
  const flipped =
    normalizeTeamNameForMatch(bracketMatch.home) !== normalizeTeamNameForMatch(event.home_team.name);
  if (!flipped) return gcSide;
  return gcSide === "home" ? "away" : "home";
}

function outsInCurrentHalf(event: GcScoreboardEvent): number | undefined {
  const totalOuts = event.sport_specific?.bats?.total_outs;
  if (totalOuts == null || !Number.isFinite(totalOuts)) return undefined;
  return totalOuts % 3;
}

/**
 * Extracts live baseball situation from the public GameChanger widget API.
 * Balls and strikes are included when present on the payload (not currently
 * returned by GC's public scoreboard endpoint).
 */
export function liveBaseballSituationFromEvent(
  event: GcScoreboardEvent,
  bracketMatch?: GcBracketMatchRef,
): LiveBaseballSituation {
  const inningLabel = inningLabelFromEvent(event);
  const gcBatting = gcTeamSideBatting(event);
  const battingSide =
    gcBatting && bracketMatch ? mapGcSideToBracketSide(gcBatting, bracketMatch, event) : gcBatting;

  const balls = event.sport_specific?.bats?.balls;
  const strikes = event.sport_specific?.bats?.strikes;
  const outsInHalf = outsInCurrentHalf(event);

  return {
    inningLabel,
    battingSide,
    balls: balls != null && Number.isFinite(balls) ? balls : undefined,
    strikes: strikes != null && Number.isFinite(strikes) ? strikes : undefined,
    outsInHalf,
  };
}
