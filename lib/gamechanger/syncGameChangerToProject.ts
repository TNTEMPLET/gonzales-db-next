import { collectLayoutMatchesForGc } from "@/lib/gamechanger/collectLayoutMatches";
import {
  findNewlyFinalizedBracketMatchIds,
  markFinalizedEventIds,
  newlyCompletedUnimportedEvents,
} from "@/lib/gamechanger/findNewlyFinalizedBracketMatches";
import { fetchGameChangerScoreboardSyncWindow } from "@/lib/gamechanger/fetchScoreboard";
import { importGcScoresIntoBracket } from "@/lib/gamechanger/importScoresIntoBracket";
import { buildLivePayloadFromEvents } from "@/lib/gamechanger/matchEventsToBracket";
import { bracketGameChangerSchema, type GcAdminLiveResponse } from "@/lib/gamechanger/types";
import { buildBracketLayout } from "@/lib/tournament-brackets/bracketLayout";
import { mergeBracketSpec, type BracketSpec } from "@/lib/tournament-brackets/bracketSpec";

export type SyncGameChangerOptions = {
  /** Import all completed games now (manual action). */
  forceImportCompleted?: boolean;
  /** Auto-import newly finalized games (default from spec.gameChanger.autoImportFinalScores). */
  autoImport?: boolean;
};

export type SyncGameChangerResult = {
  live: GcAdminLiveResponse;
  spec: BracketSpec;
  specUpdated: boolean;
};

export async function syncGameChangerToProject(
  spec: BracketSpec,
  options: SyncGameChangerOptions = {},
): Promise<SyncGameChangerResult> {
  const gcParsed = bracketGameChangerSchema.safeParse(spec.gameChanger);
  if (!gcParsed.success) {
    throw new Error("GameChanger is not configured for this bracket.");
  }

  const gc = gcParsed.data;
  const layout = buildBracketLayout(spec);
  const bracketMatches = collectLayoutMatchesForGc(layout);

  const { response, events } = await fetchGameChangerScoreboardSyncWindow(gc.widgetId);
  const live = buildLivePayloadFromEvents(
    bracketMatches,
    events,
    response.next_update,
    gc.matchEventPins,
  );

  let nextSpec = spec;
  let specUpdated = false;
  let importedMatchIds: string[] = [];

  const autoImport = options.autoImport ?? (gc.autoImportFinalScores !== false);
  const importedIds = new Set(gc.importedFinalEventIds ?? []);

  const newlyFinalizedMatchIds = findNewlyFinalizedBracketMatchIds(
    bracketMatches,
    live,
    importedIds,
  );

  const shouldImport =
    options.forceImportCompleted ||
    (autoImport && newlyCompletedUnimportedEvents(events, importedIds).length > 0);

  if (shouldImport) {
    const matchIdsToTry = options.forceImportCompleted
      ? bracketMatches
          .filter((ref) => live.eventsByMatchId[ref.id]?.game_status === "completed")
          .map((ref) => ref.id)
      : bracketMatches
          .filter((ref) => {
            const event = live.eventsByMatchId[ref.id];
            return event?.game_status === "completed" && !importedIds.has(event.id);
          })
          .map((ref) => ref.id);

    const importResult = importGcScoresIntoBracket(nextSpec, bracketMatches, events, {
      onlyCompleted: true,
      matchIds: matchIdsToTry,
      skipUnchanged: !options.forceImportCompleted,
      matchEventPins: gc.matchEventPins,
    });

    if (importResult.importedMatchIds.length > 0) {
      nextSpec = importResult.spec;
      importedMatchIds = importResult.importedMatchIds;
      specUpdated = true;
    }
  }

  if (newlyFinalizedMatchIds.length > 0) {
    markFinalizedEventIds(bracketMatches, live, newlyFinalizedMatchIds, importedIds);
    const mergedGc = bracketGameChangerSchema.parse(nextSpec.gameChanger);
    nextSpec = mergeBracketSpec(nextSpec, {
      gameChanger: {
        ...mergedGc,
        importedFinalEventIds: [...importedIds],
      },
    });
    specUpdated = true;
  }

  return {
    live: {
      ...live,
      organizationName: response.data.organization.name,
      polledAt: new Date().toISOString(),
      importedMatchIds,
      newlyFinalizedMatchIds,
      specUpdated,
    },
    spec: nextSpec,
    specUpdated,
  };
}
