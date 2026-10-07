import { formatScoutSyncActivity } from "@/lib/scout/skipSummary";
import { SCOUT_STORAGE_NOT_READY, scoutUiText } from "@/lib/scout/storageError";
import type { ScoutPageModel, ScoutSyncView, ScoutTicketDetail, ScoutTicketListItem } from "@/lib/scout/view";

/** Fired after a Scout run, seed, or ticket save so the nav badge refetches. */
export const SCOUT_DATA_CHANGED_EVENT = "apbaseball:scout-data-changed";

export function notifyScoutDataChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SCOUT_DATA_CHANGED_EVENT));
}

export type ScoutSyncClientReport = {
  ok?: boolean;
  error?: string | null;
  backfillPending?: boolean;
  created?: number;
  appended?: number;
  skipCounts?: Record<string, number>;
  fallbackKeeps?: number;
};

export type ScoutTicketsPayload = {
  tickets: ScoutTicketListItem[];
  selected: ScoutTicketDetail | null;
  sync: ScoutSyncView;
  attentionCount: number;
};

/**
 * Line under the sync panel after Run Scout now.
 * Failures are omitted here because the panel already shows them.
 */
export function scoutSyncRunNotice(input: {
  httpOk: boolean;
  error: string | null;
  backfillPending: boolean;
  created?: number;
  appended?: number;
  skipCounts?: Record<string, number>;
  fallbackKeeps?: number;
}): string | null {
  if (!input.httpOk || input.error) return null;
  const activity = formatScoutSyncActivity(input);
  if (input.backfillPending) {
    const base = "Synced one batch. Scout will keep importing the rest of the inbox.";
    return activity ? `${base} ${activity}.` : base;
  }
  return activity ? `Sync finished. ${activity}.` : "Sync finished.";
}

/**
 * Optimistic sync line after Run Scout now. A storage failure is not written,
 * so the previous last-run time stays put and the caller shows the message.
 */
export function applyScoutSyncReport(
  model: ScoutPageModel,
  report: ScoutSyncClientReport,
  nowIso: string,
): ScoutPageModel {
  const error = report.error ? (scoutUiText(report.error) ?? "Scout sync failed.") : null;
  if (error === SCOUT_STORAGE_NOT_READY) return model;
  const failed = report.ok === false || Boolean(error);
  return {
    ...model,
    sync: {
      lastRunAt: nowIso,
      lastSuccessAt: failed ? model.sync.lastSuccessAt : nowIso,
      lastError: failed ? error : null,
      backfillPending: failed ? false : Boolean(report.backfillPending),
    },
  };
}

/** Replace the list, selection, and sync state from GET /api/admin/scout/tickets. */
export function applyScoutTicketsPayload(model: ScoutPageModel, payload: ScoutTicketsPayload): ScoutPageModel {
  return {
    ...model,
    tickets: payload.tickets,
    selected: payload.selected,
    attentionCount: payload.attentionCount,
    storageMessage: null,
    sync: {
      ...payload.sync,
      lastError: scoutUiText(payload.sync.lastError),
    },
  };
}

/** Identity of the server-rendered page, so a stale refresh does not wipe a newer client fetch. */
export function scoutPagePropKey(model: ScoutPageModel): string {
  return JSON.stringify({
    sync: model.sync,
    attentionCount: model.attentionCount,
    storageMessage: model.storageMessage,
    seedAllowed: model.seedAllowed,
    filters: model.filters,
    tickets: model.tickets,
    selected: model.selected,
  });
}
