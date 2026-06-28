import type { LiveBaseballSituation, BracketSide } from "@/lib/gamechanger/liveBaseballSituation";
import { normalizeTeamNameForMatch } from "@/lib/gamechanger/matchEventsToBracket";
import type { GcBracketMatchRef, GcScoreboardEvent } from "@/lib/gamechanger/types";

export type WriterLiveDetail = {
  balls?: number;
  strikes?: number;
  outsInHalf?: number;
  inning?: number;
  half?: "top" | "bottom";
};

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

function inningLabelFromHalf(inning?: number, half?: "top" | "bottom"): string | undefined {
  if (!inning || !half) return undefined;
  const label = half === "top" ? "Top" : "Bot";
  return `${label} ${inning}`;
}

export function mergeWriterLiveDetail(
  base: LiveBaseballSituation,
  writer?: WriterLiveDetail | null,
  bracketMatch?: GcBracketMatchRef,
  event?: GcScoreboardEvent,
): LiveBaseballSituation {
  if (!writer) return base;

  const merged: LiveBaseballSituation = { ...base };

  if (writer.balls != null) merged.balls = writer.balls;
  if (writer.strikes != null) merged.strikes = writer.strikes;
  if (writer.outsInHalf != null) merged.outsInHalf = writer.outsInHalf;

  const inningLabel = inningLabelFromHalf(writer.inning, writer.half);
  if (inningLabel) merged.inningLabel = inningLabel;

  if (writer.half && bracketMatch && event) {
    const gcSide: BracketSide = writer.half === "top" ? "away" : "home";
    merged.battingSide = mapGcSideToBracketSide(gcSide, bracketMatch, event);
  }

  return merged;
}
