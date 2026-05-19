import { collectLayoutMatchesForGc } from "@/lib/gamechanger/collectLayoutMatches";
import { fetchGameChangerScoreboardWindow } from "@/lib/gamechanger/fetchScoreboard";
import { importGcScoresIntoBracket } from "@/lib/gamechanger/importScoresIntoBracket";
import { buildLivePayloadFromEvents } from "@/lib/gamechanger/matchEventsToBracket";
import { bracketGameChangerSchema, type GcAdminLiveResponse, type GcScoreboardEvent } from "@/lib/gamechanger/types";
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

  const { response, events } = await fetchGameChangerScoreboardWindow(gc.widgetId);
  const live = buildLivePayloadFromEvents(bracketMatches, events, response.next_update);

  let nextSpec = spec;
  let specUpdated = false;
  let importedMatchIds: string[] = [];

  const autoImport =
    options.autoImport ?? (gc.autoImportFinalScores !== false);
  const importedIds = new Set(gc.importedFinalEventIds ?? []);

  const shouldImport =
    options.forceImportCompleted ||
    (autoImport && newlyFinalEvents(events, importedIds).length > 0);

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
    });

    if (importResult.importedMatchIds.length > 0) {
      nextSpec = importResult.spec;
      importedMatchIds = importResult.importedMatchIds;
      specUpdated = true;

      for (const ref of bracketMatches) {
        const event = live.eventsByMatchId[ref.id];
        if (event?.game_status === "completed" && importResult.importedMatchIds.includes(ref.id)) {
          importedIds.add(event.id);
        }
      }

      nextSpec = mergeBracketSpec(nextSpec, {
        gameChanger: {
          ...gc,
          importedFinalEventIds: [...importedIds],
        },
      });
    }
  }

  return {
    live: {
      ...live,
      organizationName: response.data.organization.name,
      polledAt: new Date().toISOString(),
      importedMatchIds,
      specUpdated,
    },
    spec: nextSpec,
    specUpdated,
  };
}
