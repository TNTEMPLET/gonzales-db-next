import type { GcBracketMatchRef, GcLiveMatchPayload, GcScoreboardEvent } from "@/lib/gamechanger/types";

/** Bracket match ids whose pinned/mapped GC event is newly completed (not yet recorded in importedFinalEventIds). */
export function findNewlyFinalizedBracketMatchIds(
  bracketMatches: GcBracketMatchRef[],
  live: Pick<GcLiveMatchPayload, "eventsByMatchId">,
  importedFinalEventIds: ReadonlySet<string> | string[],
): string[] {
  const imported = importedFinalEventIds instanceof Set ? importedFinalEventIds : new Set(importedFinalEventIds);
  const matchIds: string[] = [];

  for (const ref of bracketMatches) {
    const event = live.eventsByMatchId[ref.id];
    if (event?.game_status === "completed" && !imported.has(event.id)) {
      matchIds.push(ref.id);
    }
  }

  return matchIds;
}

export function markFinalizedEventIds(
  bracketMatches: GcBracketMatchRef[],
  live: Pick<GcLiveMatchPayload, "eventsByMatchId">,
  finalizedMatchIds: string[],
  importedFinalEventIds: Set<string>,
): void {
  const finalized = new Set(finalizedMatchIds);
  for (const ref of bracketMatches) {
    if (!finalized.has(ref.id)) continue;
    const event = live.eventsByMatchId[ref.id];
    if (event?.game_status === "completed") {
      importedFinalEventIds.add(event.id);
    }
  }
}

export function newlyCompletedUnimportedEvents(
  events: GcScoreboardEvent[],
  importedFinalEventIds: ReadonlySet<string> | string[],
): GcScoreboardEvent[] {
  const imported =
    importedFinalEventIds instanceof Set ? importedFinalEventIds : new Set(importedFinalEventIds);
  return events.filter((event) => event.game_status === "completed" && !imported.has(event.id));
}
