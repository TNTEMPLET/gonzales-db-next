import { collectLayoutMatchesForGc } from "@/lib/gamechanger/collectLayoutMatches";
import { fetchGameChangerScoreboardSyncWindow } from "@/lib/gamechanger/fetchScoreboard";
import { importGcScoresIntoBracket } from "@/lib/gamechanger/importScoresIntoBracket";
import { buildLivePayloadFromEvents } from "@/lib/gamechanger/matchEventsToBracket";
import {
  bracketGameChangerSchema,
  type GcAdminLiveResponse,
  type GcLiveMatchPayload,
  type GcScoreboardEvent,
} from "@/lib/gamechanger/types";
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

function newlyFinalEvents(
  events: GcScoreboardEvent[],
  importedIds: Set<string>,
): GcScoreboardEvent[] {
  return events.filter((e) => e.game_status === "completed" && !importedIds.has(e.id));
}

type CompletedGcImportProgressionResult = {
  live: GcLiveMatchPayload;
  spec: BracketSpec;
  specUpdated: boolean;
  importedMatchIds: string[];
};

function livePayloadForSpec(
  spec: BracketSpec,
  events: GcScoreboardEvent[],
  nextUpdate: string | undefined,
): GcLiveMatchPayload {
  const gc = bracketGameChangerSchema.parse(spec.gameChanger);
  const layout = buildBracketLayout(spec);
  const bracketMatches = collectLayoutMatchesForGc(layout);
  return buildLivePayloadFromEvents(
    bracketMatches,
    events,
    nextUpdate,
    gc.matchEventPins,
  );
}

/**
 * Import completed GameChanger events, rebuilding bracket match refs after each
 * advancement so games that started as W/L placeholders can match in one sync.
 */
export function importCompletedGcScoresWithProgression(
  spec: BracketSpec,
  events: GcScoreboardEvent[],
  nextUpdate: string | undefined,
  options: SyncGameChangerOptions = {},
): CompletedGcImportProgressionResult {
  const gc = bracketGameChangerSchema.parse(spec.gameChanger);
  const importedIds = new Set(gc.importedFinalEventIds ?? []);
  let nextSpec = spec;
  let specUpdated = false;
  const importedMatchIds: string[] = [];
  let live = livePayloadForSpec(nextSpec, events, nextUpdate);

  if (!options.forceImportCompleted && newlyFinalEvents(events, importedIds).length === 0) {
    return { live, spec: nextSpec, specUpdated, importedMatchIds };
  }

  const maxPasses = Math.min(32, Math.max(4, events.length + 2));
  for (let pass = 0; pass < maxPasses; pass++) {
    const layout = buildBracketLayout(nextSpec);
    const bracketMatches = collectLayoutMatchesForGc(layout);
    live = buildLivePayloadFromEvents(
      bracketMatches,
      events,
      nextUpdate,
      gc.matchEventPins,
    );

    const refsToTry = bracketMatches.filter((ref) => {
      const event = live.eventsByMatchId[ref.id];
      if (event?.game_status !== "completed") return false;
      return options.forceImportCompleted || !importedIds.has(event.id);
    });
    if (refsToTry.length === 0) break;

    const importResult = importGcScoresIntoBracket(nextSpec, bracketMatches, events, {
      onlyCompleted: true,
      matchIds: refsToTry.map((ref) => ref.id),
      skipUnchanged: true,
      matchEventPins: gc.matchEventPins,
    });

    const changedMatchIds = new Set(importResult.importedMatchIds);
    const unchangedMatchIds = new Set(
      importResult.skipped
        .filter((skip) => skip.reason === "unchanged")
        .map((skip) => skip.matchId),
    );
    let importedEventIdsChanged = false;
    for (const ref of refsToTry) {
      if (!changedMatchIds.has(ref.id) && !unchangedMatchIds.has(ref.id)) continue;
      const event = live.eventsByMatchId[ref.id];
      if (event?.game_status !== "completed" || importedIds.has(event.id)) continue;
      importedIds.add(event.id);
      importedEventIdsChanged = true;
    }

    if (importResult.importedMatchIds.length > 0) {
      nextSpec = importResult.spec;
      importedMatchIds.push(...importResult.importedMatchIds);
      specUpdated = true;
    }

    if (importedEventIdsChanged) {
      nextSpec = mergeBracketSpec(nextSpec, {
        gameChanger: {
          ...gc,
          importedFinalEventIds: [...importedIds],
        },
      });
      specUpdated = true;
    }

    if (importResult.importedMatchIds.length === 0) break;
  }

  live = livePayloadForSpec(nextSpec, events, nextUpdate);
  return { live, spec: nextSpec, specUpdated, importedMatchIds };
}

export async function syncGameChangerToProject(
  spec: BracketSpec,
  options: SyncGameChangerOptions = {},
): Promise<SyncGameChangerResult> {
  const gcParsed = bracketGameChangerSchema.safeParse(spec.gameChanger);
  if (!gcParsed.success) {
    throw new Error("GameChanger is not configured for this bracket.");
  }

  const gc = gcParsed.data;
  const { response, events } = await fetchGameChangerScoreboardSyncWindow(gc.widgetId);

  const autoImport =
    options.autoImport ?? (gc.autoImportFinalScores !== false);
  const importResult = options.forceImportCompleted || autoImport
    ? importCompletedGcScoresWithProgression(spec, events, response.next_update, options)
    : {
        live: livePayloadForSpec(spec, events, response.next_update),
        spec,
        specUpdated: false,
        importedMatchIds: [],
      };

  return {
    live: {
      ...importResult.live,
      organizationName: response.data.organization.name,
      polledAt: new Date().toISOString(),
      importedMatchIds: importResult.importedMatchIds,
      specUpdated: importResult.specUpdated,
    },
    spec: importResult.spec,
    specUpdated: importResult.specUpdated,
  };
}
