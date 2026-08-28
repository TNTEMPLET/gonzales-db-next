import type { GcLiveGameStatus } from "@/lib/gamechanger/types";

/** Header line from saved bracket scores when GameChanger has no live match. */
export function bracketFinalStatusFromScores(
  homeScore?: number,
  awayScore?: number,
): GcLiveGameStatus | undefined {
  if (homeScore == null || awayScore == null) return undefined;
  return {
    scoreLabel: `${homeScore}–${awayScore}`,
    statusLabel: "Final",
  };
}

/**
 * Prefer GameChanger live/completed status; fall back to imported bracket finals
 * when the poll has no matching event (e.g. game outside the fetch window).
 */
export function resolveMatchDisplayStatus(
  liveStatus: GcLiveGameStatus | null | undefined,
  scores?: { homeScore?: number; awayScore?: number },
): GcLiveGameStatus | null | undefined {
  if (liveStatus?.statusLabel?.trim().toUpperCase() === "LIVE") {
    return liveStatus;
  }
  if (liveStatus?.scoreLabel?.trim()) {
    return liveStatus;
  }
  if (liveStatus?.inningLabel?.trim()) {
    return liveStatus;
  }
  const fromBracket = bracketFinalStatusFromScores(scores?.homeScore, scores?.awayScore);
  if (fromBracket) return fromBracket;
  return liveStatus ?? undefined;
}
